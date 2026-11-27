import { z } from 'zod';

export const learningHandoffKey = 'teachme.cv-studio.learning-handoff.v1';

export const LearningHandoffSchema = z.object({
  version: z.literal(1),
  topic: z.string().trim().min(3).max(200),
  exercise: z.string().trim().max(1200).default(''),
  role: z.string().trim().max(200).default(''),
  company: z.string().trim().max(200).default(''),
  applicationId: z.string().trim().max(80),
});

export type LearningHandoff = z.infer<typeof LearningHandoffSchema>;

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function saveLearningHandoff(storage: SessionStorageLike, input: Omit<LearningHandoff, 'version'>) {
  const handoff = LearningHandoffSchema.parse({ version: 1, ...input });
  storage.setItem(learningHandoffKey, JSON.stringify(handoff));
  return handoff;
}

export function loadLearningHandoff(storage: SessionStorageLike): LearningHandoff | null {
  const raw = storage.getItem(learningHandoffKey);
  if (!raw) return null;
  try {
    return LearningHandoffSchema.parse(JSON.parse(raw));
  } catch {
    storage.removeItem(learningHandoffKey);
    return null;
  }
}

export function clearLearningHandoff(storage: SessionStorageLike) {
  storage.removeItem(learningHandoffKey);
}
