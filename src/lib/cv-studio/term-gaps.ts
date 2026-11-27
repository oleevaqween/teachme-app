import { ZodError } from 'zod';
import { replaceEvidenceGuide, seedEvidenceGuide } from './evidence-guide';
import { activeEvidenceGuide, MAX_GUIDE_QUESTIONS, MAX_NOT_HELD, type EvidenceAnswer } from './evidence-schema';
import type { Workspace } from './schema';

export type TermImportance = 'essential' | 'desirable';
export type TermGapStatus = { kind: 'open' } | { kind: 'not-held' } | { kind: 'waiting' | 'answered' | 'skipped'; answerId: string };

export const GUIDE_FULL = "Your evidence guide for this job is full (32 questions). Mark the remaining terms as 'I don't have this yet', or answer them in a separate application.";
export const NOT_HELD_FULL = 'You have marked 40 terms for this job. Undo some first.';

/**
 * A readable message for a failed action: the full-guide message for a guide over the 32-question limit, else a zod error's
 * first issue (zod 4's own message is JSON), else the Error's message, else the fallback.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ZodError) {
    // The evidence-guide shape: a guide's answers sit at [guideIndex, 'answers'], alone or inside a workspace ('evidenceGuides', guideIndex, 'answers').
    if (e.issues.some(issue => issue.code === 'too_big' && issue.path.at(-1) === 'answers' && typeof issue.path.at(-2) === 'number')) return GUIDE_FULL;
    return e.issues[0]?.message ?? fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

const sameTerm = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The fixed evidence question for one job-advert term; its exact wording is how the term's question is found again. */
export function termQuestion(term: string): string {
  return `Have you used or done ${term.trim()}? If so, where, what did you personally do with it, and what came of it?`;
}

export function termWhy(term: string, importance: TermImportance): string {
  return `The job advert lists ${term.trim()} as ${importance === 'essential' ? 'must-have' : 'nice to have'}, and your CV does not mention it. Answer only if it is true; TeachMe will not add it for you.`;
}

/** Adds the term's question to this posting's guide (once) and returns the question's id. The term itself is never added to the CV. */
export function addTermQuestion(w: Workspace, term: string, importance: TermImportance): { workspace: Workspace; answerId: string } {
  const guide = seedEvidenceGuide(w);
  const question = termQuestion(term);
  const found = guide.answers.find(a => a.question.toLocaleLowerCase() === question.toLocaleLowerCase());
  if (found) return { workspace: replaceEvidenceGuide(w, guide), answerId: found.id };
  if (guide.answers.length >= MAX_GUIDE_QUESTIONS) throw new Error(GUIDE_FULL);
  const answer: EvidenceAnswer = { id: crypto.randomUUID(), question, why: termWhy(term, importance), answer: '', status: 'draft', attachments: [] };
  return { workspace: replaceEvidenceGuide(w, { ...guide, answers: [...guide.answers, answer] }), answerId: answer.id };
}

/** Records that the user does not have this term yet, for this posting only. */
export function markNotHeld(w: Workspace, term: string): Workspace {
  const guide = seedEvidenceGuide(w);
  const notHeld = guide.notHeld ?? [];
  if (notHeld.some(t => sameTerm(t, term))) return w;
  if (notHeld.length >= MAX_NOT_HELD) throw new Error(NOT_HELD_FULL);
  return replaceEvidenceGuide(w, { ...guide, notHeld: [...notHeld, term.trim().slice(0, 200)] });
}

export function unmarkNotHeld(w: Workspace, term: string): Workspace {
  const guide = activeEvidenceGuide(w);
  if (!guide?.notHeld) return w;
  return replaceEvidenceGuide(w, { ...guide, notHeld: guide.notHeld.filter(t => !sameTerm(t, term)) });
}

/** Where a missing term stands for the current posting; "don't have yet" takes precedence over a question. */
export function termGapStatus(w: Workspace, term: string): TermGapStatus {
  const guide = activeEvidenceGuide(w);
  if (guide?.notHeld?.some(t => sameTerm(t, term))) return { kind: 'not-held' };
  const answer = guide?.answers.find(a => a.question.toLocaleLowerCase() === termQuestion(term).toLocaleLowerCase());
  if (!answer) return { kind: 'open' };
  return { kind: answer.status === 'draft' ? 'waiting' : answer.status, answerId: answer.id };
}

/** What the Teach Me hand-off receives for a term the user wants to learn. */
export function termLearningInput(w: Workspace, term: string) {
  const topic = term.trim().slice(0, 200);
  return {
    topic,
    exercise: `Build real experience with ${topic} that you could describe in an interview.`,
    role: w.analysis?.role ?? '',
    company: w.analysis?.company ?? '',
    applicationId: w.id,
  };
}
