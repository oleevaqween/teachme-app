import { describe, expect, it } from 'vitest';
import {
  AI_CARDS_PER_REQUEST,
  MAX_BACK_LENGTH,
  MAX_FRONT_LENGTH,
  dueCards,
  dueLabel,
  isMissingFlashcardTable,
  nextReview,
  parseCardBody,
  parseGeneratedCards,
  parseReviewBody,
} from './flashcards';

const now = new Date('2026-11-27T10:00:00.000Z');
const days = (d: Date) => Math.round((d.getTime() - now.getTime()) / 86_400_000);

describe('nextReview', () => {
  it('moves a card up a box and further out on Got it: 1, 3, 7, 14, then 30 days', () => {
    expect(days(nextReview(0, 'good', now).dueAt)).toBe(1);
    expect(nextReview(0, 'good', now).box).toBe(1);
    const steps = [1, 2, 3, 4].map((box) => nextReview(box, 'good', now));
    expect(steps.map((s) => s.box)).toEqual([2, 3, 4, 5]);
    expect(steps.map((s) => days(s.dueAt))).toEqual([3, 7, 14, 30]);
  });

  it('keeps the top box at 30 days', () => {
    expect(nextReview(5, 'good', now)).toEqual({ box: 5, dueAt: new Date(now.getTime() + 30 * 86_400_000) });
  });

  it('sends a card back to box 0, due now, on Again', () => {
    expect(nextReview(4, 'again', now)).toEqual({ box: 0, dueAt: now });
  });
});

describe('due cards', () => {
  it('lists due cards, longest-waiting first, and labels the count', () => {
    const cards = [
      { id: 'later', dueAt: '2026-11-28T10:00:00.000Z' },
      { id: 'b', dueAt: '2026-11-27T09:00:00.000Z' },
      { id: 'a', dueAt: '2026-11-20T09:00:00.000Z' },
      { id: 'now', dueAt: now.toISOString() },
    ];
    expect(dueCards(cards, now).map((c) => c.id)).toEqual(['a', 'b', 'now']);
    expect(dueLabel(0)).toBeNull();
    expect(dueLabel(1)).toBe('1 card due');
    expect(dueLabel(3)).toBe('3 cards due');
  });
});

describe('parseCardBody', () => {
  it('tidies and accepts a question and answer', () => {
    expect(parseCardBody({ front: '  What is a WBS? ', back: 'A breakdown  of the scope.' })).toEqual({ ok: true, front: 'What is a WBS?', back: 'A breakdown of the scope.' });
  });

  it('refuses empty sides, wrong shapes and over-long text', () => {
    expect(parseCardBody({ front: ' ', back: 'x' }).ok).toBe(false);
    expect(parseCardBody({ front: 'x' }).ok).toBe(false);
    expect(parseCardBody(null).ok).toBe(false);
    expect(parseCardBody({ front: 'a'.repeat(MAX_FRONT_LENGTH + 1), back: 'x' }).ok).toBe(false);
    expect(parseCardBody({ front: 'x', back: 'a'.repeat(MAX_BACK_LENGTH + 1) }).ok).toBe(false);
  });
});

describe('parseReviewBody', () => {
  it('accepts only again or good', () => {
    expect(parseReviewBody({ result: 'good' })).toBe('good');
    expect(parseReviewBody({ result: 'again' })).toBe('again');
    expect(parseReviewBody({ result: 'easy' })).toBeNull();
    expect(parseReviewBody(null)).toBeNull();
  });
});

describe('parseGeneratedCards', () => {
  it('reads Q and A blocks', () => {
    const text = 'Here are your cards.\n\nQ: What is a WBS?\nA: A breakdown of the total scope.\n\nQ: Who approves the charter?\nA: The sponsor.';
    expect(parseGeneratedCards(text)).toEqual([
      { front: 'What is a WBS?', back: 'A breakdown of the total scope.' },
      { front: 'Who approves the charter?', back: 'The sponsor.' },
    ]);
  });

  it('tolerates numbering, bold, Question/Answer words and answers over several lines', () => {
    const text = '1. **Q:** What is scope creep?\n**A:** Uncontrolled growth of scope.\nIt often comes from unclear requirements.\n\n2) Question: What is a baseline?\nAnswer: The approved version.';
    expect(parseGeneratedCards(text)).toEqual([
      { front: 'What is scope creep?', back: 'Uncontrolled growth of scope.\nIt often comes from unclear requirements.' },
      { front: 'What is a baseline?', back: 'The approved version.' },
    ]);
  });

  it('ends an answer at a blank line, so closing remarks and separators are not stored', () => {
    const text = 'Q: Who signs?\nA: The sponsor.\n\nHope these help!\n\n---\n\nQ: What is scope?\nA: The work.\n\n## Done';
    expect(parseGeneratedCards(text)).toEqual([
      { front: 'Who signs?', back: 'The sponsor.' },
      { front: 'What is scope?', back: 'The work.' },
    ]);
  });

  it('reads one-line cards, strips bold, and does not take a lettered option as the answer', () => {
    expect(parseGeneratedCards('Q: What is a WBS? A: A breakdown of scope.')).toEqual([{ front: 'What is a WBS?', back: 'A breakdown of scope.' }]);
    expect(parseGeneratedCards('**Q: Who signs?**\n**A: The sponsor.**')).toEqual([{ front: 'Who signs?', back: 'The sponsor.' }]);
    expect(parseGeneratedCards('Q: Which is right?\na) one option\nA: The first.')).toEqual([{ front: 'Which is right? a) one option', back: 'The first.' }]);
  });

  it('drops repeats, questions already on the stage, half cards, and stops at the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Q: Question ${i}?\nA: Answer ${i}.`).join('\n\n');
    expect(parseGeneratedCards(many)).toHaveLength(AI_CARDS_PER_REQUEST);
    const text = 'Q: What is a WBS?\nA: One.\n\nQ: what is a wbs\nA: Two.\n\nQ: Who signs?\n\nQ: Old one?\nA: Old.';
    expect(parseGeneratedCards(text, ['Old one?'])).toEqual([{ front: 'What is a WBS?', back: 'One.' }]);
  });
});

describe('isMissingFlashcardTable', () => {
  it('spots only the Flashcard table', () => {
    expect(isMissingFlashcardTable(new Error('SQLITE_ERROR: no such table: main.Flashcard'))).toBe(true);
    expect(isMissingFlashcardTable(Object.assign(new Error('The table `main.Flashcard` does not exist'), { code: 'P2021' }))).toBe(true);
    expect(isMissingFlashcardTable(new Error('no such table: main.StageNote'))).toBe(false);
  });
});
