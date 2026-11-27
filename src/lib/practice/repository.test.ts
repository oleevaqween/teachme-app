import { createClient, type Client } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { CLAIM_LIMIT, ClaimLimitError, createPracticeRepository, PRACTICE_LIMIT, PracticeLimitError } from './repository';
import type { Attempt } from './schema';

// Throwaway database per test; never career.db.
let dir: string;
let client: Client;
beforeEach(() => {
  dir = makeTempDir('teachme-practice-repo-');
  client = createClient({ url: pathToFileURL(join(dir, 'test.db')).href });
});
afterEach(() => { client.close(); removeTempDir(dir); });

const attempt = (id: string, createdAt: string, extra: Partial<Attempt> = {}): Attempt => ({
  id, workspaceId: 'app-1', questionKey: 'pack:0123456789abcdef', questionText: 'Tell me about a budget.', followUpOf: null,
  answer: 'I managed a budget for a full year.', durationSeconds: 60, inputMethod: 'typed', score: 6,
  star: { situation: { rating: 'strong', note: '' }, task: { rating: 'weak', note: '' }, action: { rating: 'strong', note: '' }, result: { rating: 'missing', note: '' } },
  fixes: ['Add the result.'], rewrite: null, rewriteWithheld: null, followUpQuestion: null, createdAt, ...extra,
});
const q = (n: number) => ({ question: 'Question ' + n, guidance: '', kind: 'behavioural' as const });

describe('practice repository', () => {
  it('inserts attempts and lists them per application in time order', async () => {
    const repo = createPracticeRepository(client);
    await repo.insertAttempt(attempt('b', '2026-11-15T11:00:00.000Z'));
    await repo.insertAttempt(attempt('a', '2026-11-15T10:00:00.000Z'));
    await repo.insertAttempt(attempt('c', '2026-11-15T12:00:00.000Z', { workspaceId: 'app-2' }));
    const mine = await repo.listForWorkspace('app-1');
    expect(mine.attempts.map(a => a.id)).toEqual(['a', 'b']);
    expect((await repo.listAll()).attempts).toHaveLength(3);
  });

  it('keeps generated questions in the order they were returned', async () => {
    const repo = createPracticeRepository(client);
    const saved = await repo.insertQuestions('app-1', [q(1), q(2), q(3)], new Date('2026-11-15T10:00:00.000Z'));
    expect((await repo.listForWorkspace('app-1')).questions.map(x => x.id)).toEqual(saved.map(x => x.id));
  });

  it('caps extra questions at 40 per application', async () => {
    const repo = createPracticeRepository(client);
    await repo.insertQuestions('app-1', Array.from({ length: 38 }, (_, i) => q(i)));
    expect(await repo.insertQuestions('app-1', [q(100), q(101), q(102)])).toHaveLength(2);
    await expect(repo.insertQuestions('app-1', [q(200)])).rejects.toBeInstanceOf(PracticeLimitError);
    await expect(repo.insertQuestions('app-1', [q(200)])).rejects.toThrow(PRACTICE_LIMIT);
    expect((await repo.listForWorkspace('app-2')).questions).toHaveLength(0);
  });

  it('holds the cap when two inserts overlap', async () => {
    const same = createPracticeRepository(client);
    await same.insertQuestions('app-1', Array.from({ length: 38 }, (_, i) => q(i)));
    const countInserted = (results: PromiseSettledResult<unknown[]>[]) =>
      results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.length : 0), 0);

    const results = await Promise.allSettled([same.insertQuestions('app-1', [q(1), q(2)]), same.insertQuestions('app-1', [q(3), q(4)])]);
    expect(countInserted(results)).toBe(2);
    expect((await same.listForWorkspace('app-1')).questions).toHaveLength(40);
  });

  it('holds the cap when two repositories on one client overlap', async () => {
    const first = createPracticeRepository(client);
    const second = createPracticeRepository(client);
    await first.insertQuestions('app-1', Array.from({ length: 38 }, (_, i) => q(i)));
    const results = await Promise.allSettled([first.insertQuestions('app-1', [q(1), q(2)]), second.insertQuestions('app-1', [q(3), q(4)])]);
    expect(results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.length : 0), 0)).toBe(2);
    expect((await first.listForWorkspace('app-1')).questions).toHaveLength(40);
  });

  it('skips unreadable rows and rejects invalid attempts before writing', async () => {
    const repo = createPracticeRepository(client);
    await repo.insertAttempt(attempt('a', '2026-11-15T10:00:00.000Z'));
    await client.execute({ sql: 'INSERT INTO practice_attempt (id, workspace_id, question_key, body, created_at) VALUES (?, ?, ?, ?, ?)', args: ['bad', 'app-1', 'pack:0123456789abcdef', '{"id":"bad"}', '2026-11-15T10:30:00.000Z'] });
    await expect(repo.insertAttempt(attempt('x', '2026-11-15T10:00:00.000Z', { score: 0 }))).rejects.toThrow();
    const listed = await repo.listForWorkspace('app-1');
    expect(listed.attempts.map(a => a.id)).toEqual(['a']);
    expect(listed.unreadable).toBe(1);
  });

  it('recovers when table creation fails once', async () => {
    let calls = 0;
    const flaky = { ...client, batch: (...args: Parameters<Client['batch']>) => (++calls === 1 ? Promise.reject(new Error('busy')) : client.batch(...args)), execute: client.execute.bind(client) } as unknown as Client;
    const repo = createPracticeRepository(flaky);
    await expect(repo.listAll()).rejects.toThrow('busy');
    await expect(repo.listAll()).resolves.toMatchObject({ attempts: [] });
  });

  it('contains no UPDATE, DELETE or transaction calls (insert-only by construction)', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/practice/repository.ts'), 'utf8');
    expect(source).not.toMatch(/\bupdate\b|\bdelete\b|\.transaction\(/i);
  });
});

describe('claim questions', () => {
  const claim = (n: number) => ({ question: 'How did you do claim ' + n + '?', guidance: '', target: 'experience.e1', bullet: 'Managed a budget of ₦2,000,000.' });
  it('stores a claim question with its target and bullet', async () => {
    const repo = createPracticeRepository(client);
    const saved = await repo.insertClaimQuestion('app-1', claim(1), new Date('2026-11-17T09:00:00.000Z'));
    expect(saved).toMatchObject({ workspaceId: 'app-1', kind: 'claim', target: 'experience.e1', bullet: 'Managed a budget of ₦2,000,000.' });
    expect((await repo.listForWorkspace('app-1')).questions).toEqual([saved]);
  });
  it('keeps the 60 claim limit separate from the 40 generated-question limit', async () => {
    const repo = createPracticeRepository(client);
    await repo.insertQuestions('app-1', Array.from({ length: 40 }, (_, i) => q(i)));
    await expect(repo.insertQuestions('app-1', [q(99)])).rejects.toThrow(PRACTICE_LIMIT);
    for (let i = 0; i < 60; i++) await repo.insertClaimQuestion('app-1', claim(i));
    await expect(repo.insertClaimQuestion('app-1', claim(60))).rejects.toBeInstanceOf(ClaimLimitError);
    await expect(repo.insertClaimQuestion('app-1', claim(61))).rejects.toThrow(CLAIM_LIMIT);
    expect((await repo.listForWorkspace('app-1')).questions).toHaveLength(100);
  });
  it('lets generated questions in when only claim questions exist', async () => {
    const repo = createPracticeRepository(client);
    for (let i = 0; i < 45; i++) await repo.insertClaimQuestion('app-1', claim(i));
    expect(await repo.insertQuestions('app-1', [q(1), q(2)])).toHaveLength(2);
  });
});

describe('unreadable question rows', () => {
  it('count towards the 40-question limit', async () => {
    const repo = createPracticeRepository(client);
    await repo.insertQuestions('app-1', Array.from({ length: 38 }, (_, i) => q(i)));
    await client.execute({ sql: 'INSERT INTO practice_question (id, workspace_id, body, created_at) VALUES (?, ?, ?, ?)', args: ['bad', 'app-1', 'not json', '2026-11-15T10:30:00.000Z'] });
    expect(await repo.insertQuestions('app-1', [q(100), q(101)])).toHaveLength(1);
    await expect(repo.insertQuestions('app-1', [q(200)])).rejects.toThrow(PRACTICE_LIMIT);
    const listed = await repo.listForWorkspace('app-1');
    expect(listed.questions).toHaveLength(39);
    expect(listed.unreadable).toBe(1);
  });
});
