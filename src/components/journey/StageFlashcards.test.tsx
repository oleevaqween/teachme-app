import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StageFlashcards, type StageFlashcardsProps } from './StageFlashcards';
import type { CardView } from '@/lib/teaching-session-engine/flashcards';

const ok = async () => ({ ok: true as const });
const now = new Date('2026-11-27T10:00:00.000Z');
const card = (id: string, dueAt: string, front = `Question ${id}?`): CardView => ({ id, front, back: `Answer ${id}.`, source: 'ai', box: 0, dueAt });
const render = (props: Partial<StageFlashcardsProps>) =>
  renderToStaticMarkup(
    <StageFlashcards cards={[]} status="ready" add={ok} edit={ok} remove={ok} review={ok} generate={ok} reload={() => {}} initialNow={now} {...props} />
  );

describe('StageFlashcards', () => {
  it('shows the longest-waiting due card first, with the answer hidden', () => {
    const html = render({ cards: [card('b', '2026-11-27T09:00:00.000Z'), card('a', '2026-11-20T09:00:00.000Z'), card('later', '2026-12-01T09:00:00.000Z')] });
    expect(html).toContain('Review (2 due)');
    expect(html).toContain('All cards (3)');
    expect(html).toContain('Question a?');
    expect(html).not.toContain('Answer a.');
    expect(html).toContain('Show answer');
  });

  it('shows the answer with Again and Got it once revealed', () => {
    const html = render({ cards: [card('a', '2026-11-20T09:00:00.000Z')], initialRevealed: true });
    expect(html).toContain('Answer a.');
    expect(html).toContain('Again');
    expect(html).toContain('Got it');
  });

  it('says all caught up with the next due date when nothing is due', () => {
    const html = render({ cards: [card('later', '2026-12-03T09:00:00.000Z')] });
    expect(html).toContain('All caught up. Next card due 3 Dec.');
    expect(html).toContain('Make cards from this stage');
  });

  it('offers to make or add cards when the stage has none', () => {
    const html = render({ cards: [] });
    expect(html).toContain('No cards yet. Make some from this stage, or add your own.');
    expect(html).toContain('Add a card');
  });

  it('lists every card with Edit and Delete on the All cards tab', () => {
    const html = render({ cards: [card('a', now.toISOString()), card('b', '2026-12-01T09:00:00.000Z')], initialTab: 'cards' });
    expect(html).toContain('Question a?');
    expect(html).toContain('Answer b.');
    expect(html.match(/>Edit</g)).toHaveLength(2);
    expect(html.match(/>Delete</g)).toHaveLength(2);
  });

  it('shows loading, failed and not-yet-updated states plainly', () => {
    expect(render({ status: 'loading' })).toContain('Loading your cards');
    expect(render({ status: 'load-error' })).toContain('Try again');
    expect(render({ status: 'unavailable' })).toContain('npm run db:setup');
  });

  it('marks the tabs and panels for assistive technology', () => {
    const html = render({ cards: [card('a', now.toISOString())] });
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="flashcards-panel-review"');
    expect(html).toContain('role="tabpanel" id="flashcards-panel-review" aria-labelledby="flashcards-tab-review"');
  });

  it('opens on the All cards tab with the half-typed card when one is waiting from before', () => {
    const html = render({
      cards: [card('a', now.toISOString())],
      draft: { id: null, front: 'Half a question', back: '' },
      setDraft: () => {},
    });
    expect(html).toMatch(/aria-selected="true"[^>]*>All cards \(1\)/);
    expect(html).toContain('Half a question');
    expect(html).toContain('Save card');
  });

  it('names Edit and Delete after their card', () => {
    const html = render({ cards: [card('a', now.toISOString())], initialTab: 'cards' });
    expect(html).toContain('aria-label="Edit card: Question a?"');
    expect(html).toContain('aria-label="Delete card: Question a?"');
  });

  it('disables actions while the hook is saving, and says so while making cards', () => {
    const html = render({ cards: [card('a', now.toISOString())], initialRevealed: true, busy: 'review' });
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(render({ cards: [], busy: 'generate' })).toContain('Making cards…');
  });
});
