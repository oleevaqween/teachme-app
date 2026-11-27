// src/lib/teaching-session-engine/flashcards.ts
//
// Client-safe: flashcard limits, the review schedule, request checks, and reading the AI's cards.

export const MAX_FRONT_LENGTH = 300;
export const MAX_BACK_LENGTH = 1000;
/** Most cards one stage may hold. */
export const MAX_CARDS_PER_STAGE = 60;
/** Most cards one "Make cards" request adds. */
export const AI_CARDS_PER_REQUEST = 8;
/** Highest box; a card there comes back every BOX_INTERVAL_DAYS[MAX_BOX] days. */
export const MAX_BOX = 5;
/** Days until a card is due again after "Got it" moves it into box N (index N): 1, 3, 7, 14, then 30 days. */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;

const DAY_MS = 86_400_000;

export type ReviewResult = 'again' | 'good';

export type CardView = {
  id: string;
  front: string;
  back: string;
  source: 'ai' | 'own';
  box: number;
  dueAt: string;
};

/**
 * The card's next box and due time. A box counts the "Got it" answers in a row (new cards are in box 0).
 * "Got it" moves it up one box (at most MAX_BOX) and out by that box's interval; "Again" sends it back to
 * box 0, due now, so it comes round again in this review.
 */
export function nextReview(box: number, result: ReviewResult, now: Date): { box: number; dueAt: Date } {
  if (result === 'again') return { box: 0, dueAt: now };
  const next = Math.min(Math.max(0, Math.floor(box)) + 1, MAX_BOX);
  return { box: next, dueAt: new Date(now.getTime() + BOX_INTERVAL_DAYS[next] * DAY_MS) };
}

/** Cards due now or earlier. */
export function isDue(card: { dueAt: string | Date }, now: Date): boolean {
  return new Date(card.dueAt).getTime() <= now.getTime();
}

/** Due cards, the longest-waiting first. */
export function dueCards<T extends { dueAt: string | Date }>(cards: readonly T[], now: Date): T[] {
  return cards.filter((c) => isDue(c, now)).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

/** "1 card due", "3 cards due"; null when none. */
export function dueLabel(count: number): string | null {
  if (count < 1) return null;
  return `${count} ${count === 1 ? 'card' : 'cards'} due`;
}

/** One line of text: spaces tidied, trimmed. */
function tidy(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export type CardBody = { ok: true; front: string; back: string } | { ok: false; error: string };

/** Checks an add or edit body: `{ front, back }`, both non-empty and within their limits. */
export function parseCardBody(body: unknown): CardBody {
  const { front, back } = (body && typeof body === 'object' ? body : {}) as { front?: unknown; back?: unknown };
  if (typeof front !== 'string' || typeof back !== 'string') return { ok: false, error: 'Send the card as { front, back }.' };
  const f = tidy(front);
  const b = tidy(back);
  if (!f || !b) return { ok: false, error: 'A card needs both a question and an answer.' };
  if (f.length > MAX_FRONT_LENGTH) return { ok: false, error: `The question can be up to ${MAX_FRONT_LENGTH} characters.` };
  if (b.length > MAX_BACK_LENGTH) return { ok: false, error: `The answer can be up to ${MAX_BACK_LENGTH} characters.` };
  return { ok: true, front: f, back: b };
}

/** Checks a review body: `{ result: 'again' | 'good' }`. */
export function parseReviewBody(body: unknown): ReviewResult | null {
  const result = body && typeof body === 'object' ? (body as { result?: unknown }).result : undefined;
  return result === 'again' || result === 'good' ? result : null;
}

const loose = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Bold and stray asterisks around a side of a card removed. */
function unbold(text: string): string {
  return text.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
}

/**
 * Cards from the AI's reply: blocks of "Q: ..." then "A: ..." (markdown, numbering and bold are tolerated,
 * and "Q: ... A: ..." on one line). An answer ends at a blank line or the next question, so closing remarks
 * and separators are never stored. Drops empty, over-long and repeated questions (also those in
 * `existingFronts`); at most `limit` cards.
 */
export function parseGeneratedCards(
  text: string,
  existingFronts: readonly string[] = [],
  limit: number = AI_CARDS_PER_REQUEST
): { front: string; back: string }[] {
  const seen = new Set(existingFronts.map(loose));
  const cards: { front: string; back: string }[] = [];
  const marker = /^\s*(?:[-*#>]+\s*)?(?:\d+[.)]\s*)?\**\s*(q|question|a|answer)\s*\**\s*:\s*\**\s*(.*)$/i;
  const oneLine = /^(.*?\S)\s+\**\s*(?:a|answer)\s*\**\s*:\s*(.+)$/i;
  let front: string | null = null;
  let back: string[] | null = null;
  const flush = () => {
    if (front !== null && back !== null) {
      const f = tidy(unbold(front));
      const b = tidy(unbold(back.join('\n')));
      const key = loose(f);
      if (f && b && f.length <= MAX_FRONT_LENGTH && b.length <= MAX_BACK_LENGTH && key && !seen.has(key) && cards.length < limit) {
        seen.add(key);
        cards.push({ front: f, back: b });
      }
    }
    front = null;
    back = null;
  };
  for (const line of text.split('\n')) {
    const m = marker.exec(line);
    if (m && /^q/i.test(m[1])) {
      flush();
      const both = oneLine.exec(m[2]);
      if (both) {
        front = both[1];
        back = [both[2]];
        flush();
      } else {
        front = m[2];
      }
    } else if (m && front !== null && back === null) {
      back = [m[2]];
    } else if (!line.trim()) {
      // A blank line ends an answer; before the answer it is just spacing.
      if (back !== null) flush();
    } else if (back !== null) {
      back.push(line.trim());
    } else if (front !== null) {
      front += ' ' + line.trim();
    }
  }
  flush();
  return cards;
}

/** True for the error a database without the Flashcard table gives (before `npm run db:setup`). */
export function isMissingFlashcardTable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/no such table: (main\.)?"?Flashcard"?\b/i.test(error.message)) return true;
  return (error as { code?: unknown }).code === 'P2021' && /\bFlashcard\b/.test(error.message);
}

export const FLASHCARDS_UNAVAILABLE_MESSAGE =
  'Flashcards need a quick database update. Close TeachMe, run npm run db:setup, then start it again. Your lessons are not affected.';
