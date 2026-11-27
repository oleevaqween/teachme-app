import { createClient, type Client } from '@libsql/client';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { improveAnswerId } from '@/lib/cv-studio/improve-rules';
import { ConflictError, createRepository } from '@/lib/cv-studio/repository';
import type { Workspace } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { fallbackClaimQuestion } from './claims';
import { REWRITE_WITHHELD } from './fact-guard';
import { APPLICATION_MISSING, ATTEMPT_SAVE_FAILED, BULLET_CHANGED, createPracticeHandlers, EVIDENCE_CONFLICT, MASTER_BULLET_MISSING, MASTER_CONFLICT, MASTER_SAVE_FAILED, NOT_A_CLAIM, POSTING_MISSING, QUESTIONS_SAVE_FAILED, READ_FAILED, type PracticeDeps } from './handlers';
import { packQuestionKey } from './question-key';
import { FOLLOW_UP_INVALID } from './session';
import { CLAIM_LIMIT, createPracticeRepository, PRACTICE_LIMIT, PracticeLimitError } from './repository';
import type { Feedback } from './schema';

const app: Workspace = {
  ...fixture(), id: 'app-1', name: 'Acme PM',
  package: { coverLetter: 'Letter', coverLetterApproved: false, learningPriorities: [], interview: [{ question: 'Tell me about a budget you managed.', guidance: 'Use STAR.', evidence: ['experience.e1'] }] },
  packageInput: null,
};
const key = packQuestionKey('Tell me about a budget you managed.');
const feedback = (extra: Partial<Feedback> = {}): Feedback => ({
  score: 7,
  star: { situation: { rating: 'strong', note: '' }, task: { rating: 'weak', note: 'Own it.' }, action: { rating: 'strong', note: '' }, result: { rating: 'missing', note: 'Add the outcome.' } },
  fixes: ['Add the outcome.'], rewrite: 'I managed a budget of ₦2,000,000 for 4 stakeholders.', followUpQuestion: 'What would you change?', ...extra,
});
const get = (path: string) => new Request('http://localhost' + path);
const post = (body: unknown) => new Request('http://localhost/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const answer = 'I managed the yearly budget and reported monthly to stakeholders.';
const scoreBody = (extra: Record<string, unknown> = {}) => ({ action: 'score', application: 'app-1', questionKey: key, questionText: 'Tell me about a budget you managed.', answer, durationSeconds: 80, inputMethod: 'typed', followUpOf: null, ...extra });

// Throwaway database per test; never career.db. The AI is a stand-in; no provider is called.
let dir: string;
let client: Client;
let cv: ReturnType<typeof createRepository>;
let practice: ReturnType<typeof createPracticeRepository>;
let ai: { score: Mock<PracticeDeps['ai']['score']>; generate: Mock<PracticeDeps['ai']['generate']>; claim: Mock<PracticeDeps['ai']['claim']> };
let handlers: ReturnType<typeof createPracticeHandlers>;
beforeEach(async () => {
  dir = makeTempDir('teachme-practice-api-');
  client = createClient({ url: pathToFileURL(join(dir, 'test.db')).href });
  cv = createRepository(client);
  practice = createPracticeRepository(client);
  await cv.save({ ...fixture(), id: 'master', kind: 'master', parentId: null, name: 'Master CV' }, 0);
  await cv.save(app, 0);
  ai = { score: vi.fn(async () => feedback()), generate: vi.fn(async () => [{ question: 'Why Acme?', guidance: 'Use the posting.', kind: 'company' }, { question: 'Tell me about a budget you managed', guidance: '', kind: 'behavioural' }]), claim: vi.fn(async () => ({ question: 'How did you track the ₦2,000,000 budget?', guidance: 'Name the report you used.' })) };
  handlers = createPracticeHandlers({ practice, workspaces: cv, ai });
});
afterEach(() => { client.close(); removeTempDir(dir); });

describe('/api/practice', () => {
  it('returns the session for an application or a master CV, and 404 for missing ones', async () => {
    const response = await handlers.GET(get('/api/practice?application=app-1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.application).toMatchObject({ id: 'app-1', kind: 'application', hasPosting: true });
    expect(body.questions.map((q: { key: string }) => q.key)).toEqual([key]);
    const master = await (await handlers.GET(get('/api/practice?application=master'))).json();
    expect(master.application).toMatchObject({ id: 'master', kind: 'master', role: 'Project Manager', hasPosting: false });
    expect(master.questions).toEqual([]);
    const missing = await handlers.GET(get('/api/practice?application=nope'));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe(APPLICATION_MISSING);
  });

  it('scores and saves an attempt with the fact guard applied, then summarises it', async () => {
    const created = await handlers.POST(post(scoreBody()));
    expect(created.status).toBe(201);
    const attempt = await created.json();
    expect(attempt).toMatchObject({ score: 7, rewrite: 'I managed a budget of ₦2,000,000 for 4 stakeholders.', rewriteWithheld: null, followUpQuestion: 'What would you change?' });
    const summary = await (await handlers.GET(get('/api/practice?summary=1'))).json();
    expect(summary.summaries).toEqual([
      { workspaceId: 'master', kind: 'master', name: 'Master CV', role: 'Project Manager', company: '', practised: 0, total: 0, average: null },
      { workspaceId: 'app-1', kind: 'application', name: 'Acme PM', role: 'Acme PM', company: '', practised: 1, total: 1, average: 7 },
    ]);
  });

  it('withholds a rewrite with invented numbers but still saves the feedback', async () => {
    ai.score.mockResolvedValueOnce(feedback({ rewrite: 'I cut costs by 30%.' }));
    const attempt = await (await handlers.POST(post(scoreBody()))).json();
    expect(attempt).toMatchObject({ rewrite: null, rewriteWithheld: REWRITE_WITHHELD, score: 7 });
  });

  it('saves nothing when the AI step fails, and logs the failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      ai.score.mockRejectedValueOnce(new Error('Provider timed out'));
      const failed = await handlers.POST(post(scoreBody()));
      expect(failed.status).toBe(502);
      expect((await failed.json()).error).toBe('Provider timed out');
      expect(log).toHaveBeenCalledWith('[practice] AI step failed:', expect.any(Error));
      const session = await (await handlers.GET(get('/api/practice?application=app-1'))).json();
      expect(session.attempts).toHaveLength(0);
    } finally {
      log.mockRestore();
    }
  });

  it('accepts one level of follow-up and passes the earlier answer to the AI', async () => {
    const main = await (await handlers.POST(post(scoreBody()))).json();
    const follow = await handlers.POST(post(scoreBody({ followUpOf: main.id, questionText: 'What would you change?', answer: 'I would involve finance earlier in the planning.' })));
    expect(follow.status).toBe(201);
    expect((await follow.json()).followUpQuestion).toBeNull();
    expect(ai.score.mock.calls[1][0].parent).toEqual({ question: 'Tell me about a budget you managed.', answer });
    const listed = (await (await handlers.GET(get('/api/practice?application=app-1'))).json()).attempts as { id: string; followUpOf: string | null }[];
    const followId = listed.find(a => a.followUpOf !== null)!.id;
    expect((await handlers.POST(post(scoreBody({ followUpOf: followId })))).status).toBe(400);
  });

  it('rejects unknown question keys and short answers without calling the AI', async () => {
    expect((await handlers.POST(post(scoreBody({ questionKey: 'extra:gone' })))).status).toBe(400);
    const short = await handlers.POST(post(scoreBody({ answer: 'Too short' })));
    expect(short.status).toBe(400);
    expect((await short.json()).error).toBe('Write at least 20 characters before asking for feedback.');
    expect(ai.score).not.toHaveBeenCalled();
  });

  it('generates new questions, dropping repeats of existing ones', async () => {
    const created = await handlers.POST(post({ action: 'generate', application: 'app-1' }));
    expect(created.status).toBe(201);
    expect((await created.json()).questions.map((q: { text: string }) => q.text)).toEqual(['Why Acme?']);
    const session = await (await handlers.GET(get('/api/practice?application=app-1'))).json();
    expect(session.questions).toHaveLength(2);
  });

  it('refuses generation without a posting', async () => {
    const cv = createRepository(client);
    await cv.save({ ...app, id: 'app-2', jobDescription: '' }, 0);
    const refused = await handlers.POST(post({ action: 'generate', application: 'app-2' }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toBe(POSTING_MISSING);
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('returns 500 and saves nothing when the attempt cannot be saved after the AI step', async () => {
    const practice = createPracticeRepository(client);
    const failing = createPracticeHandlers({ practice: { ...practice, insertAttempt: async () => { throw new Error('disk full'); } }, workspaces: createRepository(client), ai });
    const failed = await failing.POST(post(scoreBody()));
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).toBe(ATTEMPT_SAVE_FAILED);
    expect((await (await handlers.GET(get('/api/practice?application=app-1'))).json()).attempts).toHaveLength(0);
  });

  it('returns 500 when new questions cannot be saved, and 400 at the cap', async () => {
    const practice = createPracticeRepository(client);
    const failing = createPracticeHandlers({ practice: { ...practice, insertQuestions: async () => { throw new Error('disk full'); } }, workspaces: createRepository(client), ai });
    const failed = await failing.POST(post({ action: 'generate', application: 'app-1' }));
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).toBe(QUESTIONS_SAVE_FAILED);
    const racing = createPracticeHandlers({ practice: { ...practice, insertQuestions: async () => { throw new PracticeLimitError(); } }, workspaces: createRepository(client), ai });
    const limited = await racing.POST(post({ action: 'generate', application: 'app-1' }));
    expect(limited.status).toBe(400);
    expect((await limited.json()).error).toBe(PRACTICE_LIMIT);
  });

  it('refuses to generate at the 40 question cap without calling the AI', async () => {
    const practice = createPracticeRepository(client);
    const full = Array.from({ length: 40 }, (_, i) => ({ id: 'q' + i, workspaceId: 'app-1', question: 'Q' + i, guidance: '', kind: 'behavioural' as const, createdAt: '2026-01-01T00:00:00.000Z' }));
    const capped = createPracticeHandlers({ practice: { ...practice, listForWorkspace: async () => ({ questions: full, attempts: [], unreadable: 0 }) }, workspaces: createRepository(client), ai });
    const refused = await capped.POST(post({ action: 'generate', application: 'app-1' }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toBe(PRACTICE_LIMIT);
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('returns 502 when the AI fails while generating', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      ai.generate.mockRejectedValueOnce(new Error('Provider timed out'));
      const failed = await handlers.POST(post({ action: 'generate', application: 'app-1' }));
      expect(failed.status).toBe(502);
      expect((await failed.json()).error).toBe('Provider timed out');
      expect(log).toHaveBeenCalledWith('[practice] AI step failed:', expect.any(Error));
    } finally {
      log.mockRestore();
    }
  });

  it('returns 500 with a plain message when stored data cannot be read', async () => {
    const practice = createPracticeRepository(client);
    const broken = createPracticeHandlers({ practice: { ...practice, listForWorkspace: async () => { throw new Error('db locked'); } }, workspaces: createRepository(client), ai });
    const failed = await broken.POST(post(scoreBody()));
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).toBe(READ_FAILED);
    expect(ai.score).not.toHaveBeenCalled();
  });

  it('rejects a follow-up whose parent belongs to a different question', async () => {
    const main = await (await handlers.POST(post(scoreBody()))).json();
    const other = await (await handlers.POST(post({ action: 'generate', application: 'app-1' }))).json();
    const otherKey = other.questions[0].key;
    const bad = await handlers.POST(post(scoreBody({ questionKey: otherKey, followUpOf: main.id })));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe(FOLLOW_UP_INVALID);
  });

  it('ignores the client questionText and uses the server wording', async () => {
    const main = await (await handlers.POST(post(scoreBody({ questionText: 'Forged question' })))).json();
    expect(main.questionText).toBe('Tell me about a budget you managed.');
    expect(ai.score.mock.calls[0][0].question).toBe('Tell me about a budget you managed.');
    const follow = await (await handlers.POST(post(scoreBody({ followUpOf: main.id, questionText: 'Forged follow-up', answer: 'I would involve finance earlier in the planning.' })))).json();
    expect(follow.questionText).toBe('What would you change?');
    expect(ai.score.mock.calls[1][0].question).toBe('What would you change?');
  });

  it('rejects a follow-up when the parent has no follow-up question', async () => {
    ai.score.mockResolvedValueOnce(feedback({ followUpQuestion: null }));
    const main = await (await handlers.POST(post(scoreBody()))).json();
    const bad = await handlers.POST(post(scoreBody({ followUpOf: main.id })));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe(FOLLOW_UP_INVALID);
  });

  it('refuses requests that are not from this computer', async () => {
    expect((await handlers.GET(new Request('http://example.com/api/practice?summary=1'))).status).toBe(400);
  });
});

const bullet = 'Managed a budget of ₦2,000,000.';
const claimBody = (extra: Record<string, unknown> = {}) => ({ action: 'claim', application: 'app-1', target: 'experience.e1', bullet, ...extra });
async function claimAndScore(application = 'app-1') {
  const opened = await (await handlers.POST(post(claimBody({ application })))).json();
  const attempt = await (await handlers.POST(post({ ...scoreBody({ application, questionKey: opened.question.key, questionText: opened.question.text }) }))).json();
  return { question: opened.question, attempt };
}
const evidenceBody = (attemptId: string, extra: Record<string, unknown> = {}) => ({ action: 'save-evidence', application: 'app-1', attemptId, answer: 'I tracked every payment monthly in a shared sheet with finance.', number: 'approximate', confirmed: true, ...extra });

describe('claim questions', () => {
  it('refuses a bullet that is no longer in the CV, without calling the AI', async () => {
    const response = await handlers.POST(post(claimBody({ bullet: 'Managed a budget of ₦9.' })));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(BULLET_CHANGED);
    expect(ai.claim).not.toHaveBeenCalled();
  });

  it('writes a question once, reuses it, and writes a different one on request', async () => {
    const first = await handlers.POST(post(claimBody()));
    expect(first.status).toBe(201);
    const created = await first.json();
    expect(created).toMatchObject({ fallback: false, question: { source: 'claim', kind: 'claim', text: 'How did you track the ₦2,000,000 budget?', claim: { target: 'experience.e1', bullet } } });
    expect(ai.claim).toHaveBeenCalledWith(expect.objectContaining({ bullet, existing: [], role: 'Acme PM' }), expect.anything());
    const again = await handlers.POST(post(claimBody()));
    expect(again.status).toBe(200);
    expect((await again.json()).question.key).toBe(created.question.key);
    expect(ai.claim).toHaveBeenCalledTimes(1);
    ai.claim.mockResolvedValueOnce({ question: 'Who approved the spending?', guidance: '' });
    const fresh = await (await handlers.POST(post(claimBody({ fresh: true })))).json();
    expect(fresh.question.key).not.toBe(created.question.key);
    expect(ai.claim).toHaveBeenLastCalledWith(expect.objectContaining({ existing: ['How did you track the ₦2,000,000 budget?'] }), expect.anything());
  });

  it('uses the standard question when the AI fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      ai.claim.mockRejectedValueOnce(new Error('Provider timed out'));
      const body = await (await handlers.POST(post(claimBody()))).json();
      expect(body).toMatchObject({ fallback: true, question: { text: fallbackClaimQuestion(bullet).question } });
    } finally { log.mockRestore(); }
  });

  it('works on a master CV with its professional title as the role', async () => {
    const response = await handlers.POST(post(claimBody({ application: 'master' })));
    expect(response.status).toBe(201);
    expect(ai.claim).toHaveBeenCalledWith(expect.objectContaining({ role: 'Project Manager', posting: '' }), expect.anything());
  });

  it('stops at 60 claim questions without calling the AI', async () => {
    for (let i = 0; i < 60; i++) await practice.insertClaimQuestion('app-1', { question: 'Q' + i, guidance: '', target: 'experience.e1', bullet: 'Prepared monthly reports for 4 stakeholders.' });
    const response = await handlers.POST(post(claimBody()));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(CLAIM_LIMIT);
    expect(ai.claim).not.toHaveBeenCalled();
  });

  it('scores a master CV claim with an empty posting', async () => {
    await claimAndScore('master');
    expect(ai.score).toHaveBeenCalledWith(expect.objectContaining({ posting: '', role: 'Project Manager' }), expect.anything());
  });

  it('does not count claim questions towards the 40 generated question limit', async () => {
    for (let i = 0; i < 60; i++) await practice.insertClaimQuestion('app-1', { question: 'Q' + i, guidance: '', target: 'experience.e1', bullet: 'Prepared monthly reports for 4 stakeholders.' });
    const response = await handlers.POST(post({ action: 'generate', application: 'app-1' }));
    expect(response.status).toBe(201);
    expect(ai.generate).toHaveBeenCalled();
  });

  it('passes the claim to scoring', async () => {
    await claimAndScore();
    expect(ai.score).toHaveBeenCalledWith(expect.objectContaining({ claim: bullet }), expect.anything());
  });
});

describe('save as evidence', () => {
  it('refuses without the tick, for follow-ups and for questions that are not claims', async () => {
    const { attempt } = await claimAndScore();
    const unticked = await handlers.POST(post(evidenceBody(attempt.id, { confirmed: false })));
    expect(unticked.status).toBe(400);
    const followUp = await (await handlers.POST(post(scoreBody({ questionKey: attempt.questionKey, followUpOf: attempt.id })))).json();
    expect((await (await handlers.POST(post(evidenceBody(followUp.id)))).json()).error).toBe(NOT_A_CLAIM);
    const packAttempt = await (await handlers.POST(post(scoreBody()))).json();
    expect((await (await handlers.POST(post(evidenceBody(packAttempt.id)))).json()).error).toBe(NOT_A_CLAIM);
    expect((await cv.get('app-1'))?.improve).toBeUndefined();
  });

  it('saves the answer on the CV and on the master, and updates it on a second save', async () => {
    const { question, attempt } = await claimAndScore();
    const response = await handlers.POST(post(evidenceBody(attempt.id)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, master: 'saved', masterNote: null });
    const id = improveAnswerId('experience.e1', question.text);
    for (const workspaceId of ['app-1', 'master']) {
      expect((await cv.get(workspaceId))?.improve?.answers).toEqual([{ id, target: 'experience.e1', bullet, question: question.text, answer: 'I tracked every payment monthly in a shared sheet with finance.', number: 'approximate', status: 'answered' }]);
    }
    await handlers.POST(post(evidenceBody(attempt.id, { answer: 'I tracked every payment weekly with the finance lead.' })));
    const answers = (await cv.get('app-1'))?.improve?.answers ?? [];
    expect(answers).toHaveLength(1);
    expect(answers[0].answer).toBe('I tracked every payment weekly with the finance lead.');
    expect((await cv.versions('app-1')).map(v => v.label)).toEqual(['Created']);
  });

  it('saves only on the application when the master no longer has the bullet', async () => {
    const { attempt } = await claimAndScore();
    const master = (await cv.get('master'))!;
    await cv.save({ ...master, resume: { ...master.resume, experience: master.resume.experience.map(e => ({ ...e, achievements: 'Managed a budget.' })) } }, master.revision);
    expect(await (await handlers.POST(post(evidenceBody(attempt.id)))).json()).toEqual({ saved: true, master: 'skipped', masterNote: MASTER_BULLET_MISSING });
    expect((await cv.get('app-1'))?.improve?.answers).toHaveLength(1);
    expect((await cv.get('master'))?.improve).toBeUndefined();
  });

  it('reports a save conflict and writes nothing', async () => {
    const { attempt } = await claimAndScore();
    const conflicted = createPracticeHandlers({ practice, ai, workspaces: { get: cv.get, listReadable: cv.listReadable, save: async () => { throw new ConflictError('changed'); } } });
    const response = await conflicted.POST(post(evidenceBody(attempt.id)));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(EVIDENCE_CONFLICT);
    expect((await cv.get('app-1'))?.improve).toBeUndefined();
  });

  it('keeps the save successful when the master copy fails', async () => {
    const { attempt } = await claimAndScore();
    const failing = createPracticeHandlers({ practice, ai, workspaces: { get: cv.get, listReadable: cv.listReadable, save: async (w, r) => { if (w.id === 'master') throw new Error('disk full'); return cv.save(w, r); } } });
    const response = await failing.POST(post(evidenceBody(attempt.id)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, master: 'skipped', masterNote: MASTER_SAVE_FAILED });
  });

  it('keeps the save successful when the master copy throws unexpectedly', async () => {
    const { attempt } = await claimAndScore();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const odd = createPracticeHandlers({ practice, ai, workspaces: { get: cv.get, save: cv.save, listReadable: async () => {
        const all = await cv.listReadable();
        return { ...all, workspaces: all.workspaces.map(w => w.id === 'master' ? Object.defineProperty({ ...w }, 'improve', { get() { throw new Error('boom'); } }) : w) };
      } } });
      const response = await odd.POST(post(evidenceBody(attempt.id)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true, master: 'skipped', masterNote: MASTER_SAVE_FAILED });
      expect(spy).toHaveBeenCalledWith('[practice] master copy failed:', expect.any(Error));
    } finally { spy.mockRestore(); }
  });

  it('reports a master conflict without failing the save', async () => {
    const { attempt } = await claimAndScore();
    const conflicted = createPracticeHandlers({ practice, ai, workspaces: { get: cv.get, listReadable: cv.listReadable, save: async (w, r) => { if (w.id === 'master') throw new ConflictError('changed'); return cv.save(w, r); } } });
    const response = await conflicted.POST(post(evidenceBody(attempt.id)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, master: 'skipped', masterNote: MASTER_CONFLICT });
  });

  it('refuses when the CV already has 150 saved answers', async () => {
    const { attempt } = await claimAndScore();
    const app1 = (await cv.get('app-1'))!;
    const full = Array.from({ length: 150 }, (_, i) => ({ id: 'a' + i, target: 'projects', bullet: '', question: 'Q' + i, answer: 'x', number: 'none' as const, status: 'answered' as const }));
    await cv.save({ ...app1, improve: { answers: full } }, app1.revision);
    const response = await handlers.POST(post(evidenceBody(attempt.id)));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('limit of 150 saved answers');
  });
});

describe('save as evidence: changed bullets and real conflicts', () => {
  it('refuses when the bullet was changed in CV Studio after the practice, writing nothing', async () => {
    const { attempt } = await claimAndScore();
    const app1 = (await cv.get('app-1'))!;
    await cv.save({ ...app1, resume: { ...app1.resume, experience: app1.resume.experience.map(e => ({ ...e, achievements: 'Managed a budget of ₦3,000,000.' })) } }, app1.revision);
    const response = await handlers.POST(post(evidenceBody(attempt.id)));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(BULLET_CHANGED);
    expect((await cv.get('app-1'))?.improve).toBeUndefined();
    expect((await cv.get('master'))?.improve).toBeUndefined();
  });

  it('refuses a really stale revision when the CV is saved elsewhere meanwhile, keeping the other save', async () => {
    const { attempt } = await claimAndScore();
    let raced = false;
    const racing = createPracticeHandlers({ practice, ai, workspaces: { listReadable: cv.listReadable, save: cv.save, get: async id => {
      const loaded = await cv.get(id);
      // Another tab saves this CV after the handler has read it, so the handler's revision is out of date.
      if (loaded && id === 'app-1' && !raced) { raced = true; await cv.save({ ...loaded, name: 'Renamed in another tab' }, loaded.revision); }
      return loaded;
    } } });
    const response = await racing.POST(post(evidenceBody(attempt.id)));
    expect(raced).toBe(true);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(EVIDENCE_CONFLICT);
    const stored = (await cv.get('app-1'))!;
    expect(stored.name).toBe('Renamed in another tab');
    expect(stored.improve).toBeUndefined();
    expect((await cv.get('master'))?.improve).toBeUndefined();
  });
});
