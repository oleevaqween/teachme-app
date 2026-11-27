import { z, ZodError } from 'zod';
import { localRequest, readBody } from '@/lib/cv-studio/http';
import { upsertImproveAnswer } from '@/lib/cv-studio/improve-rules';
import type { ImproveAnswer } from '@/lib/cv-studio/improve-schema';
import { ConflictError } from '@/lib/cv-studio/repository';
import type { SavedWorkspace, Workspace } from '@/lib/cv-studio/schema';
import { branchSource } from '@/lib/cv-studio/workspace-rules';
import { claimEvidence, fallbackClaimQuestion, hasBullet } from './claims';
import { guardRewrite } from './fact-guard';
import type { ClaimContext, GenerateContext, ScoreContext } from './feedback';
import { extraQuestionKey } from './question-key';
import { CLAIM_LIMIT, ClaimLimitError, PRACTICE_LIMIT, PracticeLimitError, type PracticeRepository } from './repository';
import { AttemptSchema, ClaimRequestSchema, MAX_CLAIM_QUESTIONS, MAX_EXTRA_QUESTIONS, SaveEvidenceSchema, ScoreRequestSchema, type Attempt, type Feedback, type GeneratedQuestion, type PracticeQuestion } from './schema';
import { applicationInfo, buildSessionQuestions, cvFactsFor, dedupeGenerated, FOLLOW_UP_INVALID, summarize, validateAttemptTarget } from './session';

export type PracticeDeps = {
  practice: PracticeRepository;
  /** CV Studio workspaces: read freely; written only to add evidence the user confirmed. */
  workspaces: {
    get(id: string): Promise<SavedWorkspace | null>;
    listReadable(): Promise<{ workspaces: SavedWorkspace[] }>;
    save(w: Workspace, expectedRevision: number): Promise<SavedWorkspace>;
  };
  ai: {
    score(ctx: ScoreContext, signal?: AbortSignal): Promise<Feedback>;
    generate(ctx: GenerateContext, signal?: AbortSignal): Promise<GeneratedQuestion[]>;
    claim(ctx: ClaimContext, signal?: AbortSignal): Promise<{ question: string; guidance: string }>;
  };
  now?: () => Date;
  newId?: () => string;
};

export const APPLICATION_MISSING = 'This CV was not found. It may have been deleted in CV Studio.';
export const BULLET_CHANGED = 'This bullet has changed. Go back to CV Studio and try again.';
export const NOT_A_CLAIM = 'Only a main answer to a claim question can be saved as evidence.';
export const EVIDENCE_CONFLICT = 'This CV was changed elsewhere. Reload this page and save again.';
export const EVIDENCE_SAVE_FAILED = 'The evidence could not be saved. Please try again.';
export const MASTER_BULLET_MISSING = 'Your master CV no longer has this bullet word for word, so the answer was saved on this CV only.';
export const MASTER_FULL = 'Your master CV has reached its limit of 150 saved answers, so the answer was saved on this CV only.';
export const MASTER_CONFLICT = 'Your master CV was changed elsewhere, so the answer was saved on this CV only. Reload and save again to add it there.';
export const MASTER_SAVE_FAILED = 'Your master CV could not be updated, so the answer was saved on this CV only.';
export const POSTING_MISSING = 'Add the job posting in CV Studio before generating questions.';

const applicationId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/, APPLICATION_MISSING);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const READ_FAILED = 'Something went wrong reading your practice data. Please try again.';
export const ATTEMPT_SAVE_FAILED = 'Your feedback could not be saved. Your answer is still in the box; please try again.';
export const QUESTIONS_SAVE_FAILED = 'The new questions could not be saved. Please try again.';

/** Marks a failure to read stored data, so it is reported as a server error rather than a bad request. */
class ReadError extends Error {}
async function reading<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { throw new ReadError(error instanceof Error ? error.message : 'read failed'); }
}

function requestError(error: unknown): Response {
  if (error instanceof ReadError) return json({ error: READ_FAILED }, 500);
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? 'Please check your answer and try again.' }, 400);
  return json({ error: error instanceof Error ? error.message : 'The request could not be completed.' }, 400);
}

function aiError(error: unknown): Response {
  const cancelled = error instanceof Error && error.name === 'AbortError';
  if (!cancelled) console.error('[practice] AI step failed:', error);
  const message = cancelled
    ? 'The request was cancelled.'
    : error instanceof Error ? error.message : 'The AI step failed. Please try again.';
  return json({ error: message }, 502);
}

export function createPracticeHandlers(deps: PracticeDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  /** Any saved CV, master or application. */
  async function loadWorkspace(raw: unknown): Promise<SavedWorkspace | null> {
    const parsed = applicationId.safeParse(raw);
    if (!parsed.success) return null;
    return await reading(() => deps.workspaces.get(parsed.data));
  }

  async function summaries(): Promise<Response> {
    const [{ workspaces }, all] = await reading(() => Promise.all([deps.workspaces.listReadable(), deps.practice.listAll()]));
    // Master CVs first; otherwise the repository's most-recently-updated order.
    const ordered = [...workspaces].sort((a, b) => Number(b.kind === 'master') - Number(a.kind === 'master'));
    const rows = ordered.map(w => {
      const questions = buildSessionQuestions(w, all.questions.filter(q => q.workspaceId === w.id), all.attempts.filter(a => a.workspaceId === w.id));
      const info = applicationInfo(w);
      return { workspaceId: w.id, kind: w.kind, name: w.name, role: info.role, company: info.company, ...summarize(questions) };
    });
    return json({ summaries: rows, unreadable: all.unreadable });
  }

  async function score(request: Request, body: unknown): Promise<Response> {
    const input = ScoreRequestSchema.parse(body);
    const workspace = await loadWorkspace(input.application);
    if (!workspace) return json({ error: APPLICATION_MISSING }, 404);
    const data = await reading(() => deps.practice.listForWorkspace(workspace.id));
    const questions = buildSessionQuestions(workspace, data.questions, data.attempts);
    const invalid = validateAttemptTarget(questions, data.attempts, input);
    if (invalid) return json({ error: invalid }, 400);
    const parent = input.followUpOf ? data.attempts.find(a => a.id === input.followUpOf) ?? null : null;
    // The client's questionText is not trusted: the server derives the wording from its own data.
    const questionText = parent ? parent.followUpQuestion : questions.find(q => q.key === input.questionKey)?.text ?? null;
    if (!questionText) return json({ error: FOLLOW_UP_INVALID }, 400);
    const info = applicationInfo(workspace);
    const cvFacts = cvFactsFor(workspace);
    let feedback: Feedback;
    try {
      feedback = await deps.ai.score({
        role: info.role, company: info.company, posting: info.hasPosting ? workspace.jobDescription : '', cvFacts,
        question: questionText, answer: input.answer,
        claim: questions.find(q => q.key === input.questionKey)?.claim?.bullet,
        parent: parent ? { question: parent.questionText, answer: parent.answer } : undefined,
      }, request.signal);
    } catch (error) {
      return aiError(error);
    }
    const guarded = guardRewrite(feedback.rewrite, [input.answer, ...(parent ? [parent.answer] : []), ...Object.values(cvFacts)]);
    try {
      const attempt: Attempt = AttemptSchema.parse({
        id: newId(), workspaceId: workspace.id, questionKey: input.questionKey, questionText,
        followUpOf: input.followUpOf, answer: input.answer, durationSeconds: input.durationSeconds, inputMethod: input.inputMethod,
        score: feedback.score, star: feedback.star, fixes: feedback.fixes,
        rewrite: guarded.rewrite, rewriteWithheld: guarded.rewriteWithheld,
        followUpQuestion: input.followUpOf ? null : feedback.followUpQuestion,
        createdAt: now().toISOString(),
      });
      return json(await deps.practice.insertAttempt(attempt), 201);
    } catch {
      return json({ error: ATTEMPT_SAVE_FAILED }, 500);
    }
  }

  async function generate(request: Request, body: unknown): Promise<Response> {
    const input = z.object({ application: applicationId }).parse(body);
    const workspace = await loadWorkspace(input.application);
    if (!workspace) return json({ error: APPLICATION_MISSING }, 404);
    const info = applicationInfo(workspace);
    if (!info.hasPosting) return json({ error: POSTING_MISSING }, 400);
    const data = await reading(() => deps.practice.listForWorkspace(workspace.id));
    if (data.questions.filter(q => q.kind !== 'claim').length >= MAX_EXTRA_QUESTIONS) return json({ error: PRACTICE_LIMIT }, 400);
    const existing = buildSessionQuestions(workspace, data.questions, []).map(q => q.text);
    let generated: GeneratedQuestion[];
    try {
      generated = await deps.ai.generate({ role: info.role, company: info.company, posting: info.hasPosting ? workspace.jobDescription : '', cvFacts: cvFactsFor(workspace), existing }, request.signal);
    } catch (error) {
      return aiError(error);
    }
    const fresh = dedupeGenerated(generated, existing);
    let inserted: Awaited<ReturnType<PracticeRepository['insertQuestions']>> = [];
    try {
      if (fresh.length) inserted = await deps.practice.insertQuestions(workspace.id, fresh, now());
    } catch (error) {
      if (error instanceof PracticeLimitError) return json({ error: error.message }, 400);
      return json({ error: QUESTIONS_SAVE_FAILED }, 500);
    }
    return json({ questions: buildSessionQuestions({ ...workspace, package: null }, inserted, []) }, 201);
  }

  async function claim(request: Request, body: unknown): Promise<Response> {
    const input = ClaimRequestSchema.parse(body);
    const workspace = await loadWorkspace(input.application);
    if (!workspace) return json({ error: APPLICATION_MISSING }, 404);
    if (!hasBullet(workspace.resume, input.target, input.bullet)) return json({ error: BULLET_CHANGED }, 400);
    const data = await reading(() => deps.practice.listForWorkspace(workspace.id));
    const claims = data.questions.filter(q => q.kind === 'claim');
    const same = claims.filter(q => q.target === input.target && q.bullet === input.bullet);
    const toSession = (q: PracticeQuestion) => buildSessionQuestions({ ...workspace, package: null }, [q], data.attempts)[0];
    const latest = same.at(-1);
    // Reopening a saved claim question: it is the standard question when its text is exactly the standard one
    // for this bullet, so the "standard question" note shows again (nothing extra is stored).
    if (!input.fresh && latest) {
      return json({ question: toSession(latest), fallback: latest.question === fallbackClaimQuestion(input.bullet).question });
    }
    if (claims.length >= MAX_CLAIM_QUESTIONS) return json({ error: CLAIM_LIMIT }, 400);
    const info = applicationInfo(workspace);
    let written: { question: string; guidance: string };
    let fallback = false;
    try {
      written = await deps.ai.claim({
        role: info.role, company: info.company, posting: info.hasPosting ? workspace.jobDescription : '',
        cvFacts: cvFactsFor(workspace), bullet: input.bullet, existing: same.map(q => q.question),
      }, request.signal);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return aiError(error);
      console.error('[practice] claim question fell back to the standard question:', error);
      written = fallbackClaimQuestion(input.bullet);
      fallback = true;
    }
    try {
      const saved = await deps.practice.insertClaimQuestion(workspace.id, { ...written, target: input.target, bullet: input.bullet }, now());
      return json({ question: toSession(saved), fallback }, 201);
    } catch (error) {
      if (error instanceof ClaimLimitError) return json({ error: error.message }, 400);
      return json({ error: QUESTIONS_SAVE_FAILED }, 500);
    }
  }

  type MasterCopy = { master: 'saved' | 'skipped' | 'none'; masterNote: string | null };
  /** Copies saved evidence to the application's root master CV when the master still has the same bullet. */
  async function copyToMaster(workspace: SavedWorkspace, target: string, bullet: string, evidence: ImproveAnswer): Promise<MasterCopy> {
    if (workspace.kind === 'master') return { master: 'none', masterNote: null };
    let master: SavedWorkspace | undefined;
    try {
      const { workspaces } = await deps.workspaces.listReadable();
      const root = branchSource(workspace, workspaces);
      master = root.kind === 'master' && root.id !== workspace.id ? workspaces.find(w => w.id === root.id) : undefined;
    } catch {
      return { master: 'skipped', masterNote: MASTER_SAVE_FAILED };
    }
    if (!master) return { master: 'none', masterNote: null };
    if (!hasBullet(master.resume, target, bullet)) return { master: 'skipped', masterNote: MASTER_BULLET_MISSING };
    const next = upsertImproveAnswer(master.improve?.answers ?? [], evidence);
    if (next.error) return { master: 'skipped', masterNote: MASTER_FULL };
    try {
      await deps.workspaces.save({ ...master, improve: { answers: next.answers } }, master.revision);
      return { master: 'saved', masterNote: null };
    } catch (error) {
      return { master: 'skipped', masterNote: error instanceof ConflictError ? MASTER_CONFLICT : MASTER_SAVE_FAILED };
    }
  }

  async function saveEvidence(body: unknown): Promise<Response> {
    const input = SaveEvidenceSchema.parse(body);
    const workspace = await loadWorkspace(input.application);
    if (!workspace) return json({ error: APPLICATION_MISSING }, 404);
    const data = await reading(() => deps.practice.listForWorkspace(workspace.id));
    const attempt = data.attempts.find(a => a.id === input.attemptId);
    const asked = attempt && attempt.followUpOf === null ? data.questions.find(q => extraQuestionKey(q.id) === attempt.questionKey) : undefined;
    if (!asked || asked.kind !== 'claim' || !asked.target || !asked.bullet) return json({ error: NOT_A_CLAIM }, 400);
    // The answer belongs to one bullet; if that bullet was edited or removed since the practice, nothing is saved.
    if (!hasBullet(workspace.resume, asked.target, asked.bullet)) return json({ error: BULLET_CHANGED }, 400);
    const evidence = claimEvidence({ target: asked.target, bullet: asked.bullet, question: asked.question }, input.answer, input.number);
    const own = upsertImproveAnswer(workspace.improve?.answers ?? [], evidence);
    if (own.error) return json({ error: own.error }, 400);
    try {
      await deps.workspaces.save({ ...workspace, improve: { answers: own.answers } }, workspace.revision);
    } catch (error) {
      if (error instanceof ConflictError) return json({ error: EVIDENCE_CONFLICT }, 409);
      return json({ error: EVIDENCE_SAVE_FAILED }, 500);
    }
    let copy: MasterCopy;
    try {
      copy = await copyToMaster(workspace, asked.target, asked.bullet, evidence);
    } catch (error) {
      console.error('[practice] master copy failed:', error);
      copy = { master: 'skipped', masterNote: MASTER_SAVE_FAILED };
    }
    return json({ saved: true, ...copy });
  }

  return {
    async GET(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const url = new URL(request.url);
        if (url.searchParams.get('summary') === '1') return await summaries();
        const workspace = await loadWorkspace(url.searchParams.get('application'));
        if (!workspace) return json({ error: APPLICATION_MISSING }, 404);
        const data = await reading(() => deps.practice.listForWorkspace(workspace.id));
        return json({
          application: applicationInfo(workspace),
          questions: buildSessionQuestions(workspace, data.questions, data.attempts),
          attempts: data.attempts,
          unreadable: data.unreadable,
        });
      } catch (error) {
        return requestError(error);
      }
    },
    async POST(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const body: unknown = await readBody(request);
        const { action } = z.object({ action: z.enum(['score', 'generate', 'claim', 'save-evidence']) }).parse(body);
        if (action === 'score') return await score(request, body);
        if (action === 'generate') return await generate(request, body);
        if (action === 'claim') return await claim(request, body);
        return await saveEvidence(body);
      } catch (error) {
        return requestError(error);
      }
    },
  };
}
