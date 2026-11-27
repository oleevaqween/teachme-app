import type { Client, Row } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { getCareerClient } from '@/lib/career-db/client';
import { PRACTICE_TABLE_STATEMENTS } from '@/lib/career-db/tables';
import { AttemptSchema, MAX_CLAIM_QUESTIONS, MAX_EXTRA_QUESTIONS, PracticeQuestionSchema, type Attempt, type GeneratedQuestion, type PracticeQuestion } from './schema';

export const PRACTICE_LIMIT = 'This application already has the maximum of 40 extra questions.';
export class PracticeLimitError extends Error {
  constructor() { super(PRACTICE_LIMIT); this.name = 'PracticeLimitError'; }
}
export const CLAIM_LIMIT = 'You have 60 claim questions for this CV. Practise the ones you have.';
export class ClaimLimitError extends Error {
  constructor() { super(CLAIM_LIMIT); this.name = 'ClaimLimitError'; }
}

// Each row's stored kind, or NULL for a row whose JSON cannot be read (such rows still count towards the 40 limit, as before).
const KIND = "(CASE WHEN json_valid(body) THEN json_extract(body, '$.kind') END)";

export type PracticeData = { questions: PracticeQuestion[]; attempts: Attempt[]; unreadable: number };

/**
 * Interview practice storage in career.db. Safety: insert and select only, no
 * interactive transactions (the cap check runs inside a single write batch), and the only
 * schema statements create this feature's own tables and indexes if missing.
 */
export function createPracticeRepository(client: Client) {
  let ready: Promise<unknown> | undefined;
  const init = () => ready ??= client.batch([...PRACTICE_TABLE_STATEMENTS], 'write').catch(error => { ready = undefined; throw error; });

  function readRows<T>(rows: Row[], parse: (value: unknown) => T): { items: T[]; unreadable: number } {
    const items: T[] = [];
    let unreadable = 0;
    for (const row of rows) {
      try { items.push(parse(JSON.parse(String(row.body)))); } catch { unreadable++; }
    }
    return { items, unreadable };
  }

  async function list(where: string, args: string[]): Promise<PracticeData> {
    await init();
    const [questionRows, attemptRows] = await Promise.all([
      client.execute({ sql: `SELECT body FROM practice_question ${where} ORDER BY created_at, id`, args }),
      client.execute({ sql: `SELECT body FROM practice_attempt ${where} ORDER BY created_at, id`, args }),
    ]);
    const questions = readRows(questionRows.rows, value => PracticeQuestionSchema.parse(value));
    const attempts = readRows(attemptRows.rows, value => AttemptSchema.parse(value));
    return { questions: questions.items, attempts: attempts.items, unreadable: questions.unreadable + attempts.unreadable };
  }

  return {
    listForWorkspace: (workspaceId: string) => list('WHERE workspace_id = ?', [workspaceId]),
    listAll: () => list('', []),

    async insertAttempt(input: Attempt): Promise<Attempt> {
      const attempt = AttemptSchema.parse(input);
      await init();
      await client.execute({
        sql: 'INSERT INTO practice_attempt (id, workspace_id, question_key, body, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [attempt.id, attempt.workspaceId, attempt.questionKey, JSON.stringify(attempt), attempt.createdAt],
      });
      return attempt;
    },

    /** Inserts up to the remaining room under the cap; throws PracticeLimitError when there is none. */
    async insertQuestions(workspaceId: string, items: GeneratedQuestion[], now = new Date()): Promise<PracticeQuestion[]> {
      await init();
      const counted = await client.execute({ sql: 'SELECT COUNT(*) AS total FROM practice_question WHERE workspace_id = ? AND ' + KIND + " IS NOT 'claim'", args: [workspaceId] });
      const room = MAX_EXTRA_QUESTIONS - Number(counted.rows[0]?.total ?? 0);
      if (room <= 0) throw new PracticeLimitError();
      // One millisecond apart so list order matches the order the AI returned them.
      const questions = items.slice(0, room).map((item, index) => PracticeQuestionSchema.parse({
        id: randomUUID(), workspaceId, question: item.question, guidance: item.guidance, kind: item.kind,
        createdAt: new Date(now.getTime() + index).toISOString(),
      }));
      // Each insert re-checks the cap inside the same write batch, so overlapping calls cannot exceed it.
      await client.batch(questions.map(q => ({
        sql: 'INSERT INTO practice_question (id, workspace_id, body, created_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM practice_question WHERE workspace_id = ? AND ' + KIND + " IS NOT 'claim') < ?",
        args: [q.id, q.workspaceId, JSON.stringify(q), q.createdAt, q.workspaceId, MAX_EXTRA_QUESTIONS],
      })), 'write');
      if (!questions.length) return [];
      const saved = await client.execute({
        sql: `SELECT body FROM practice_question WHERE id IN (${questions.map(() => '?').join(', ')})`,
        args: questions.map(q => q.id),
      });
      const insertedIds = new Set(readRows(saved.rows, value => PracticeQuestionSchema.parse(value)).items.map(x => x.id));
      const inserted = questions.filter(q => insertedIds.has(q.id));
      if (!inserted.length) throw new PracticeLimitError();
      return inserted;
    },

    /** Inserts one claim question under the 60-per-CV cap; throws ClaimLimitError when there is no room. */
    async insertClaimQuestion(workspaceId: string, item: { question: string; guidance: string; target: string; bullet: string }, now = new Date()): Promise<PracticeQuestion> {
      await init();
      const question = PracticeQuestionSchema.parse({
        id: randomUUID(), workspaceId, question: item.question, guidance: item.guidance, kind: 'claim',
        target: item.target, bullet: item.bullet, createdAt: now.toISOString(),
      });
      // The cap is checked inside the insert itself, so overlapping calls cannot exceed it.
      await client.execute({
        sql: 'INSERT INTO practice_question (id, workspace_id, body, created_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM practice_question WHERE workspace_id = ? AND ' + KIND + " = 'claim') < ?",
        args: [question.id, question.workspaceId, JSON.stringify(question), question.createdAt, question.workspaceId, MAX_CLAIM_QUESTIONS],
      });
      const saved = await client.execute({ sql: 'SELECT id FROM practice_question WHERE id = ?', args: [question.id] });
      if (!saved.rows.length) throw new ClaimLimitError();
      return question;
    },
  };
}

export type PracticeRepository = ReturnType<typeof createPracticeRepository>;

let repository: PracticeRepository | undefined;
export function getPracticeRepository(): PracticeRepository {
  return repository ??= createPracticeRepository(getCareerClient());
}
