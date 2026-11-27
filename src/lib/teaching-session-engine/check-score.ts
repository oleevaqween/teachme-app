// src/lib/teaching-session-engine/check-score.ts
//
// Client-safe: the closing "Score: N/M" line of a "Check my understanding" round, how it is read,
// and how it is shown.

/** Most questions a check asks; a larger total is not a check score. */
export const MAX_CHECK_QUESTIONS = 10;

/** Added to both check instructions: how the closing summary ends. */
export const CHECK_SCORE_RULE =
  'End that summary with a final line in exactly this form: Score: N/M, where M is the number of questions you asked and N is how many the student answered correctly or mostly correctly.';

export type CheckScore = { correct: number; total: number };

// A whole line: optional heading, quote or list marks and bold, an optional word such as "Final", "Score",
// then N/M or "N out of M", an optional "correct" or "questions" and "(75%)", optional closing punctuation.
const SCORE_LINE =
  /^\s*(?:[#>*-]+\s*)*\**\s*(?:(?:final|your|total|overall)\s+)?score\s*\**\s*:?\s*\**\s*(\d{1,2})\s*(?:\/|out of)\s*(\d{1,2})\s*(?:correct|questions?|answers?)?\s*(?:\(\s*\d{1,3}\s*%\s*\))?\s*\**\s*[.!]?\s*\**\s*$/i;

/**
 * The score from the reply's LAST non-empty line when it is a "Score: N/M" line, or null. Only the last line
 * counts, as the instruction asks, so a running tally written before the next question is never taken as the
 * result. `maxTotal` (the number of questions actually asked, when known) rejects an impossible total.
 */
export function parseCheckScore(text: string, maxTotal: number = MAX_CHECK_QUESTIONS): CheckScore | null {
  const last = text.split('\n').map((line) => line.trim()).filter(Boolean).at(-1);
  const match = last ? SCORE_LINE.exec(last) : null;
  if (!match) return null;
  const correct = Number(match[1]);
  const total = Number(match[2]);
  if (total < 1 || total > Math.min(maxTotal, MAX_CHECK_QUESTIONS) || correct > total) return null;
  return { correct, total };
}

/** "Last check 3/4" for the journey map. */
export function checkScoreLabel(score: CheckScore): string {
  return `Last check ${score.correct}/${score.total}`;
}

/** True for the error a database without the CheckResult table gives (before `npm run db:setup`). */
export function isMissingCheckResultTable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/no such table: (main\.)?"?CheckResult"?\b/i.test(error.message)) return true;
  return (error as { code?: unknown }).code === 'P2021' && /\bCheckResult\b/.test(error.message);
}
