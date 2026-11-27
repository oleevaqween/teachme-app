import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
/** Where an Improve my CV answer belongs: one role's achievements or the projects text. */
export const ImproveTargetSchema = z.string().regex(/^(?:(?:experience|volunteering)\.[a-zA-Z0-9_-]{1,80}|projects)$/);
/** One "Improve my CV" question and the user's answer. Only answered, non-empty answers become evidence. */
export const ImproveAnswerSchema = z.object({
  id,
  target: ImproveTargetSchema,
  bullet: z.string().max(2000),
  question: z.string().min(1).max(2000),
  answer: z.string().max(6000),
  number: z.enum(['exact', 'approximate', 'none']),
  status: z.enum(['draft', 'answered', 'skipped']),
});
export const ImproveSchema = z.object({
  answers: z.array(ImproveAnswerSchema).max(150).refine(a => new Set(a.map(x => x.id)).size === a.length, 'Improve answer IDs must be unique.'),
});
export type ImproveAnswer = z.infer<typeof ImproveAnswerSchema>;

export function improveCatalog(w: { improve?: { answers: ImproveAnswer[] } }): Record<string, string> {
  return Object.fromEntries((w.improve?.answers ?? []).filter(a => a.status === 'answered' && a.answer.trim()).map(a => ['improve.' + a.id, a.answer]));
}
