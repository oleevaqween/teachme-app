import { z, ZodError } from 'zod';
import { localRequest, readBody } from '@/lib/cv-studio/http';
import { guardRewrite } from '@/lib/practice/fact-guard';
import type { ScoreContext } from '@/lib/practice/feedback';
import { MAX_ANSWER, MIN_ANSWER, type Feedback } from '@/lib/practice/schema';

export const QUICK_REWRITE_WITHHELD = 'This rewrite included details that are not in your answer, so it was not shown.';

export type QuickFeedback = {
  score: number;
  star: Feedback['star'];
  fixes: string[];
  rewrite: string | null;
  rewriteWithheld: string | null;
  followUpQuestion: string | null;
};

export type QuickScoreDeps = { score(ctx: ScoreContext, signal?: AbortSignal): Promise<Feedback> };

const answerText = z.string().trim()
  .min(MIN_ANSWER, `Write at least ${MIN_ANSWER} characters before asking for feedback.`)
  .max(MAX_ANSWER, `Answers can be at most ${MAX_ANSWER} characters.`);

const QuickScoreRequestSchema = z.object({
  role: z.string().trim()
    .min(2, 'Enter the role you are practising for (at least 2 characters).')
    .max(100, 'The role can be at most 100 characters.'),
  question: z.string().trim().min(1, 'The question is missing.').max(1000, 'The question is too long.'),
  answer: answerText,
  parent: z.object({ question: z.string().trim().min(1).max(1000), answer: answerText }).optional(),
});

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Quick practice scoring: the application-practice scorer judged against the role only
 * (no posting, no CV), with the rewrite checked against the candidate's own answers.
 * Nothing is stored.
 */
export function createQuickScoreHandler(deps: QuickScoreDeps) {
  return {
    async POST(request: Request): Promise<Response> {
      let input: z.infer<typeof QuickScoreRequestSchema>;
      try {
        localRequest(request);
        input = QuickScoreRequestSchema.parse(await readBody(request));
      } catch (error) {
        if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? 'Please check your answer and try again.' }, 400);
        return json({ error: error instanceof Error ? error.message : 'The request could not be completed.' }, 400);
      }

      let feedback: Feedback;
      try {
        feedback = await deps.score({
          role: input.role, company: '', posting: '', cvFacts: {},
          question: input.question, answer: input.answer, parent: input.parent,
        }, request.signal);
      } catch (error) {
        const cancelled = error instanceof Error && error.name === 'AbortError';
        if (!cancelled) console.error('[quick-practice] AI step failed:', error);
        const message = cancelled
          ? 'The request was cancelled.'
          : error instanceof Error ? error.message : 'The AI step failed. Please try again.';
        return json({ error: message }, 502);
      }

      const guarded = guardRewrite(feedback.rewrite, [input.answer, ...(input.parent ? [input.parent.answer] : [])]);
      const result: QuickFeedback = {
        score: feedback.score,
        star: feedback.star,
        fixes: feedback.fixes,
        rewrite: guarded.rewrite,
        rewriteWithheld: guarded.rewriteWithheld ? QUICK_REWRITE_WITHHELD : null,
        followUpQuestion: input.parent ? null : feedback.followUpQuestion,
      };
      return json(result);
    },
  };
}
