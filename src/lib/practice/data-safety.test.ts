import { createClient, type Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApplicationRepository } from '@/lib/applications/repository';
import { blankApplicationInput } from '@/lib/applications/schema';
import { createRepository } from '@/lib/cv-studio/repository';
import type { Workspace } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { fingerprintTables, makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { createPracticeHandlers } from './handlers';
import { createPracticeRepository } from './repository';
import type { Feedback } from './schema';

const PROTECTED = ['cv_workspace', 'cv_version', 'job_application'];
const md5 = (file: string) => createHash('md5').update(readFileSync(file)).digest('hex');
const get = (path: string) => new Request('http://localhost' + path);
const post = (body: unknown) => new Request('http://localhost/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const standInAi = {
  claim: async () => ({ question: 'How did you measure it?', guidance: '' }),
  score: async (): Promise<Feedback> => ({
    score: 6,
    star: { situation: { rating: 'strong', note: '' }, task: { rating: 'weak', note: '' }, action: { rating: 'strong', note: '' }, result: { rating: 'missing', note: '' } },
    fixes: ['Add the outcome.'], rewrite: 'I managed the budget and reported monthly.', followUpQuestion: 'What would you change?',
  }),
  generate: async () => [{ question: 'Why do you want this role?', guidance: '', kind: 'company' as const }, { question: 'Describe a hard deadline you met.', guidance: '', kind: 'behavioural' as const }],
};

/** Runs the practice actions that must not write CV Studio tables (summary, session, generate, score and follow-up), for up to two applications; save-evidence writes cv_workspace by design and is covered in handlers.test.ts. Returns how many practice attempts were saved. */
async function exercisePractice(client: Client): Promise<number> {
  const cv = createRepository(client);
  const handlers = createPracticeHandlers({ practice: createPracticeRepository(client), workspaces: cv, ai: standInAi });
  expect((await handlers.GET(get('/api/practice?summary=1'))).status).toBe(200);
  const applications = (await cv.listReadable()).workspaces.filter(w => w.kind === 'application');
  let attempts = 0;
  for (const w of applications.slice(0, 2)) {
    expect((await handlers.GET(get('/api/practice?application=' + w.id))).status).toBe(200);
    if (w.jobDescription.trim()) expect((await handlers.POST(post({ action: 'generate', application: w.id }))).status).toBe(201);
    const session = await (await handlers.GET(get('/api/practice?application=' + w.id))).json();
    const question = session.questions[0];
    if (!question) continue;
    const answer = 'I managed the budget carefully and reported to stakeholders every month.';
    const main = await handlers.POST(post({ action: 'score', application: w.id, questionKey: question.key, questionText: question.text, answer, durationSeconds: 90, inputMethod: 'typed', followUpOf: null }));
    expect(main.status).toBe(201);
    attempts++;
    const saved = await main.json();
    const follow = await handlers.POST(post({ action: 'score', application: w.id, questionKey: question.key, questionText: saved.followUpQuestion, answer: 'I would involve the finance team much earlier.', durationSeconds: 40, inputMethod: 'spoken', followUpOf: saved.id }));
    expect(follow.status).toBe(201);
    attempts++;
  }
  return attempts;
}

describe('Interview practice data safety', () => {
  it('leaves CV Studio and tracker rows and definitions untouched (seeded temp database)', async () => {
    const dir = makeTempDir('teachme-practice-safety-');
    let client: Client | undefined;
    try {
      client = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
      const cv = createRepository(client);
      const withPack: Workspace = { ...fixture(), id: 'app-1', name: 'Acme PM', package: { coverLetter: 'L', coverLetterApproved: false, learningPriorities: [], interview: [{ question: 'Tell me about a budget.', guidance: '', evidence: [] }] }, packageInput: null };
      await cv.save({ ...fixture(), id: 'master', kind: 'master', parentId: null, name: 'Master CV' }, 0);
      await cv.save(withPack, 0);
      await cv.save({ ...withPack, name: 'Acme PM (edited)' }, 1, 'Edited');
      await cv.save({ ...fixture(), id: 'app-2', name: 'Globex Lead', package: null }, 0);
      await createApplicationRepository(client).create(blankApplicationInput({ workspaceId: 'app-1', company: 'Acme', role: 'PM' }));
      const before = await fingerprintTables(client, PROTECTED);

      expect(await exercisePractice(client)).toBe(4);

      expect(await fingerprintTables(client, PROTECTED)).toBe(before);
      const attempts = await client.execute('SELECT COUNT(*) AS n FROM practice_attempt');
      expect(Number(attempts.rows[0].n)).toBe(4); // two main answers and two follow-ups were really saved
    } finally {
      client?.close();
      removeTempDir(dir);
    }
  });

  const realDataCopy = join(process.cwd(), '.integration-data', 'career.db');
  it.skipIf(!existsSync(realDataCopy))('leaves a copy of the real CV and tracker data untouched', async (ctx) => {
    const originalHash = md5(realDataCopy);
    const dir = makeTempDir('teachme-practice-safety-');
    const copy = join(dir, 'career.db');
    copyFileSync(realDataCopy, copy);
    let client: Client | undefined;
    let skipped = false;
    try {
      client = createClient({ url: pathToFileURL(copy).href });
      // Each feature's own start-up step, so missing tables exist before fingerprinting.
      await createRepository(client).listReadable();
      await createApplicationRepository(client).listReadable();
      const before = await fingerprintTables(client, PROTECTED);
      const saved = await exercisePractice(client);
      expect(await fingerprintTables(client, PROTECTED)).toBe(before);
      if (saved === 0) skipped = true;
      else {
        const attempts = await client.execute('SELECT COUNT(*) AS n FROM practice_attempt');
        expect(Number(attempts.rows[0].n)).toBeGreaterThan(0);
      }
    } finally {
      client?.close();
      removeTempDir(dir);
    }
    expect(md5(realDataCopy)).toBe(originalHash); // the original file was only read, even when this test skips
    if (skipped) ctx.skip('The real-data copy has no application with questions or a job posting to practise on');
  });
});
