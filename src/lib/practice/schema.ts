import { z } from 'zod';
import { ImproveTargetSchema } from '@/lib/cv-studio/improve-schema';

export const questionKinds = ['behavioural', 'role', 'company'] as const;
export const starParts = ['situation', 'task', 'action', 'result'] as const;
export const starRatings = ['strong', 'weak', 'missing'] as const;
export const inputMethods = ['typed', 'spoken', 'mixed'] as const;
export type QuestionKind = (typeof questionKinds)[number];
export type StarPart = (typeof starParts)[number];
export type StarRating = (typeof starRatings)[number];
export type InputMethod = (typeof inputMethods)[number];
/** Kinds a stored question can have. The AI's generated questions only ever use questionKinds. */
export const storedKinds = [...questionKinds, 'claim'] as const;
export type StoredKind = (typeof storedKinds)[number];
export type EvidenceNumber = 'exact' | 'approximate' | 'none';

export const MIN_ANSWER = 20;
export const MAX_ANSWER = 6000;
export const MAX_EXTRA_QUESTIONS = 40;
export const MAX_CLAIM_QUESTIONS = 60;
export const MAX_BULLET = 2000;

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const QuestionKeySchema = z.string().regex(/^(pack:[0-9a-f]{16}|extra:[a-zA-Z0-9_-]{1,80})$/);

export const PracticeQuestionSchema = z.object({
  id,
  workspaceId: id,
  question: z.string().trim().min(1).max(1000),
  guidance: z.string().trim().max(2000),
  kind: z.enum(storedKinds),
  /** Claim questions only: the CV part and the exact bullet being defended. */
  target: ImproveTargetSchema.optional(),
  bullet: z.string().trim().min(1).max(MAX_BULLET).optional(),
  createdAt: z.iso.datetime(),
}).refine(
  q => (q.kind === 'claim' ? q.target !== undefined && q.bullet !== undefined : q.target === undefined && q.bullet === undefined),
  { message: 'A claim question needs its target and bullet; other questions have neither.' },
);
export type PracticeQuestion = z.infer<typeof PracticeQuestionSchema>;

const StarPartSchema = z.object({ rating: z.enum(starRatings), note: z.string().trim().max(300) });
export const StarSchema = z.object({ situation: StarPartSchema, task: StarPartSchema, action: StarPartSchema, result: StarPartSchema });
export type Star = z.infer<typeof StarSchema>;

export const AttemptSchema = z.object({
  id,
  workspaceId: id,
  questionKey: QuestionKeySchema,
  questionText: z.string().trim().min(1).max(1000),
  followUpOf: id.nullable(),
  answer: z.string().trim().min(MIN_ANSWER).max(MAX_ANSWER),
  durationSeconds: z.number().int().min(0).max(3600),
  inputMethod: z.enum(inputMethods),
  score: z.number().int().min(1).max(10),
  star: StarSchema,
  fixes: z.array(z.string().trim().min(1).max(300)).min(1).max(3),
  rewrite: z.string().max(4000).nullable(),
  rewriteWithheld: z.string().max(300).nullable(),
  followUpQuestion: z.string().trim().max(500).nullable(),
  createdAt: z.iso.datetime(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

/** The fields a feedback card shows. Saved attempts and quick-practice attempts both have them. */
export type FeedbackView = Pick<Attempt, 'questionText' | 'followUpOf' | 'score' | 'answer' | 'durationSeconds' | 'inputMethod' | 'star' | 'fixes' | 'rewrite' | 'rewriteWithheld' | 'followUpQuestion'>;

export const ScoreRequestSchema = z.object({
  application: id,
  questionKey: QuestionKeySchema,
  questionText: z.string().trim().min(1).max(1000),
  answer: z.string().trim()
    .min(MIN_ANSWER, 'Write at least 20 characters before asking for feedback.')
    .max(MAX_ANSWER, 'Answers can be at most 6000 characters.'),
  durationSeconds: z.number().int().min(0).max(3600),
  inputMethod: z.enum(inputMethods),
  followUpOf: id.nullable().default(null),
});
export type ScoreRequest = z.infer<typeof ScoreRequestSchema>;

/** AI feedback after parsing, before the fact guard runs. */
export type Feedback = { score: number; star: Star; fixes: string[]; rewrite: string | null; followUpQuestion: string | null };
export type GeneratedQuestion = { question: string; guidance: string; kind: QuestionKind };

export const ClaimRequestSchema = z.object({
  application: id,
  target: ImproveTargetSchema,
  bullet: z.string().trim().min(1).max(MAX_BULLET),
  fresh: z.boolean().default(false),
});

export const SaveEvidenceSchema = z.object({
  application: id,
  attemptId: id,
  answer: z.string().trim()
    .min(MIN_ANSWER, 'Your answer must have at least 20 characters.')
    .max(MAX_ANSWER, 'Answers can be at most 6000 characters.'),
  number: z.enum(['exact', 'approximate', 'none']),
  confirmed: z.literal(true, { error: 'Tick "This is true and I can back it up" before saving.' }),
});
