import { z } from 'zod';
import type { Market } from '@/lib/cv-studio/schema';

/** Screening question ids in the standard order. */
export const QUESTION_IDS = ['uk-right', 'uk-sponsor', 'us-right', 'us-sponsor', 'ng-right', 'location', 'licences', 'years', 'salary', 'notice'] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

/** The questions that often reject applicants automatically, worded as employers ask them. */
export const SCREENING_QUESTIONS: Record<QuestionId, string> = {
  'uk-right': 'Do you have the right to work in the UK?',
  'uk-sponsor': 'Will you need visa sponsorship to work in the UK?',
  'us-right': 'Are you authorised to work in the US?',
  'us-sponsor': 'Will you now or in future need visa sponsorship to work in the US?',
  'ng-right': 'Do you have the right to work in Nigeria?',
  location: 'Are you willing to relocate or work on site? Where?',
  licences: 'Which licences or certifications do you hold, with dates?',
  years: 'How many years of relevant experience do you have, and in what?',
  salary: 'What salary do you expect?',
  notice: 'What is your notice period or earliest start date?',
};

export const MAX_ANSWER = 500;
export const ANSWER_TOO_LONG = 'Answers must be 500 characters or fewer.';

/** Free-text answers keyed by known question ids only; any id may be missing. */
export const ScreeningAnswersSchema = z.partialRecord(z.enum(QUESTION_IDS), z.string().max(MAX_ANSWER, ANSWER_TOO_LONG));
export type ScreeningAnswers = z.infer<typeof ScreeningAnswersSchema>;

export const HONESTY_NOTE = 'Answer honestly. These questions often decide automatically whether you go forward, so a wrong answer can cost you later.';
export const SCREENING_CONFLICT = 'Your answers were changed in another tab. Reload to see them.';
export const SCREENING_UNREADABLE = 'Your saved screening answers could not be read. Saving will replace them.';

/** The stored body of the one screening_profile row. */
export const ScreeningProfileBodySchema = z.object({ answers: ScreeningAnswersSchema });
/** `unreadable` is set only when the stored answers could not be read: they open empty, and saving replaces them. */
export type ScreeningProfile = { answers: ScreeningAnswers; revision: number; unreadable?: true };

const MARKET_FIRST: Record<Market, QuestionId[]> = {
  us: ['us-right', 'us-sponsor'],
  international: ['uk-right', 'uk-sponsor'],
  nigeria: ['ng-right'],
};

/** Question ids in the order to show them: the market's own questions first, then the rest in the standard order. No market counts as International / UK. */
export function orderedQuestions(market?: Market | null): QuestionId[] {
  const first = MARKET_FIRST[market ?? 'international'];
  return [...first, ...QUESTION_IDS.filter(id => !first.includes(id))];
}
