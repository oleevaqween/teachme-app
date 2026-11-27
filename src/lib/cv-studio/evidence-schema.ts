import { z } from 'zod';
import { limitedAnswer, unfinishedOutline } from './answer-intent';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const MAX_GUIDE_QUESTIONS = 32;
export const MAX_NOT_HELD = 40;
export const EvidenceAttachmentSchema = z.object({
  id, name: z.string().min(1).max(300), text: z.string().trim().min(1).max(6000),
});
export const EvidenceAnswerSchema = z.object({
  id, question: z.string().min(1).max(12000), why: z.string().max(12000),
  answer: z.string().max(6000), status: z.enum(['draft', 'answered', 'skipped']),
  attachments: z.array(EvidenceAttachmentSchema).max(3),
  assistance: z.object({ originalReply: z.string().max(6000), kind: z.enum(['record', 'outline', 'uncertainty']), source: z.string().max(300).optional() }).optional(),
}).refine(a => a.status !== 'answered' || !!a.answer.trim() || a.attachments.length > 0, 'An answered question needs an answer or a reviewed excerpt.')
  .refine(a => a.status !== 'answered' || !unfinishedOutline(a), 'Replace or remove the bracketed prompts before confirming this answer.');
export const EvidenceGuideSchema = z.object({
  id, jobDescription: z.string().max(24000),
  answers: z.array(EvidenceAnswerSchema).max(MAX_GUIDE_QUESTIONS)
    .refine(a => new Set(a.map(x => x.id)).size === a.length, 'Answer IDs must be unique.')
    .refine(a => new Set(a.map(x => x.question)).size === a.length, 'Questions must be unique.'),
  /** Job-advert terms the user said they do not have yet, for this posting only. */
  notHeld: z.array(z.string().trim().min(1).max(200)).max(MAX_NOT_HELD)
    .refine(t => new Set(t.map(x => x.toLocaleLowerCase())).size === t.length, 'Each term is listed once.')
    .optional(),
});
export const EvidenceGuidesSchema = z.array(EvidenceGuideSchema).max(6)
  .refine(g => new Set(g.map(x => x.id)).size === g.length, 'Guide IDs must be unique.')
  .refine(g => new Set(g.map(x => x.jobDescription)).size === g.length, 'Each posting has one evidence guide.')
  .refine(g => JSON.stringify(g).length <= 100000, 'Keep guided evidence under 100,000 characters. Shorten excerpts or use a separate application for another posting.');
export type EvidenceAnswer = z.infer<typeof EvidenceAnswerSchema>;
export type EvidenceGuide = z.infer<typeof EvidenceGuideSchema>;
export type EvidenceAttachment = z.infer<typeof EvidenceAttachmentSchema>;

export function activeEvidenceGuide(w: { jobDescription: string; evidenceGuides?: EvidenceGuide[] }) {
  return w.evidenceGuides?.find(g => g.jobDescription === w.jobDescription);
}
export function guidedEvidenceCatalog(w: { jobDescription: string; evidenceGuides?: EvidenceGuide[] }): Record<string, string> {
  return Object.fromEntries((activeEvidenceGuide(w)?.answers ?? []).filter(a => a.status === 'answered').flatMap(a => [
    // Questions and file names are context, never evidence of candidate claims.
    ...(a.answer.trim() && !limitedAnswer(a.answer) && !unfinishedOutline(a) ? [['answer.' + a.id, a.answer]] : []),
    ...a.attachments.map(f => ['document.' + a.id + '.' + f.id, f.text]),
  ]));
}
export function guidedAnswerContext(w: { jobDescription: string; evidenceGuides?: EvidenceGuide[] }) {
  return (activeEvidenceGuide(w)?.answers ?? []).filter(a => a.status !== 'draft').map(a => ({
    question: a.question, status: a.status, reply: a.status === 'answered' ? a.answer : '',
    interpretation: a.status === 'skipped' ? 'skipped-not-a-claim' : limitedAnswer(a.answer) ? 'no-positive-evidence-or-uncertain' : 'user-confirmed-context',
    answerSource: a.status === 'answered' && a.answer.trim() && !limitedAnswer(a.answer) ? 'answer.' + a.id : null,
  }));
}
