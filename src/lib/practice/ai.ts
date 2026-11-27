import { ask } from '@/lib/cv-studio/ai';
import { CLAIM_SYSTEM, GENERATE_SYSTEM, SCORE_SYSTEM, parseClaimQuestion, parseFeedback, parseGenerated, practiceAiError, type ClaimContext, type GenerateContext, type ScoreContext } from './feedback';
import type { Feedback, GeneratedQuestion } from './schema';

async function askPractice(kind: 'score' | 'generate', system: string, input: Parameters<typeof ask>[1], signal?: AbortSignal) {
  try {
    return await ask(system, input, signal);
  } catch (error) {
    throw practiceAiError(error, kind);
  }
}

/** One provider call: score, STAR, fixes, rewrite and (for main answers) a follow-up question. */
export async function scoreAnswer(ctx: ScoreContext, signal?: AbortSignal): Promise<Feedback> {
  const raw = await askPractice('score', SCORE_SYSTEM, {
    job: { role: ctx.role, company: ctx.company, posting: ctx.posting },
    cvFacts: ctx.cvFacts,
    question: ctx.question,
    answer: ctx.answer,
    claim: ctx.claim ?? null,
    isFollowUp: !!ctx.parent,
    earlier: ctx.parent ?? null,
  }, signal);
  return parseFeedback(raw, !!ctx.parent);
}

export async function generateQuestions(ctx: GenerateContext, signal?: AbortSignal): Promise<GeneratedQuestion[]> {
  const raw = await askPractice('generate', GENERATE_SYSTEM, {
    job: { role: ctx.role, company: ctx.company, posting: ctx.posting },
    cvFacts: ctx.cvFacts,
    existingQuestions: ctx.existing,
  }, signal);
  return parseGenerated(raw);
}

/** One provider call: an interviewer question that tests a single CV claim. */
export async function writeClaimQuestion(ctx: ClaimContext, signal?: AbortSignal): Promise<{ question: string; guidance: string }> {
  const raw = await askPractice('generate', CLAIM_SYSTEM, {
    job: { role: ctx.role, company: ctx.company, posting: ctx.posting },
    cvFacts: ctx.cvFacts,
    claim: ctx.bullet,
    existingQuestions: ctx.existing,
  }, signal);
  return parseClaimQuestion(raw);
}
