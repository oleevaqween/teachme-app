import { describe, expect, it } from 'vitest';
import { parseReviewItems, reasonLabel, reviewHref, reviewItems, type ReviewStageInput } from './review-reminders';

const now = new Date('2026-11-27T12:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const stage = (id: string, over: Partial<ReviewStageInput> = {}): ReviewStageInput => ({
  id,
  order: Number(id.replace(/\D/g, '')) || 1,
  title: `Stage ${id}`,
  status: 'completed',
  completedAt: daysAgo(1),
  lastStudiedAt: daysAgo(1),
  lastCheck: null,
  dueCards: 0,
  ...over,
});
const journey = (stages: ReviewStageInput[]) => [{ id: 'j1', topic: 'PMBOK', stages }];

describe('reviewItems', () => {
  it('lists nothing for recent, well-checked stages', () => {
    expect(reviewItems(journey([stage('s1', { lastCheck: { correct: 4, total: 4 } })]), now)).toEqual([]);
  });

  it('reminds about due cards, low checks and stale completed stages, most urgent first', () => {
    const items = reviewItems(
      journey([
        stage('s1', { completedAt: daysAgo(30), lastStudiedAt: daysAgo(20) }),
        stage('s2', { lastCheck: { correct: 1, total: 4 } }),
        stage('s3', { dueCards: 2 }),
        stage('s4', { dueCards: 5, status: 'in_progress', completedAt: null }),
        stage('s5', { lastCheck: { correct: 2, total: 4 } }),
      ]),
      now
    );
    expect(items.map((i) => [i.stageId, i.reason.kind])).toEqual([
      ['s4', 'cards'],
      ['s3', 'cards'],
      ['s2', 'check'],
      ['s5', 'check'],
      ['s1', 'stale'],
    ]);
    expect(items[4].reason).toEqual({ kind: 'stale', days: 20 });
  });

  it('gives each stage one reminder, by the first reason that applies', () => {
    const items = reviewItems(journey([stage('s1', { dueCards: 1, lastCheck: { correct: 0, total: 3 }, completedAt: daysAgo(40), lastStudiedAt: null })]), now);
    expect(items).toHaveLength(1);
    expect(items[0].reason.kind).toBe('cards');
  });

  it('skips locked stages and does not call an unfinished stage stale', () => {
    expect(reviewItems(journey([stage('s1', { status: 'locked', dueCards: 3 })]), now)).toEqual([]);
    expect(reviewItems(journey([stage('s1', { status: 'in_progress', completedAt: null, lastStudiedAt: daysAgo(60) })]), now)).toEqual([]);
  });

  it('treats 70% as fine and 13 days as recent', () => {
    expect(reviewItems(journey([stage('s1', { lastCheck: { correct: 7, total: 10 } })]), now)).toEqual([]);
    expect(reviewItems(journey([stage('s1', { completedAt: daysAgo(13), lastStudiedAt: daysAgo(13) })]), now)).toEqual([]);
  });
});

describe('labels and links', () => {
  it('reads plainly', () => {
    expect(reasonLabel({ kind: 'cards', count: 1 })).toBe('1 card due');
    expect(reasonLabel({ kind: 'cards', count: 3 })).toBe('3 cards due');
    expect(reasonLabel({ kind: 'check', correct: 1, total: 4 })).toBe('Last check 1/4: try it again');
    expect(reasonLabel({ kind: 'stale', days: 20 })).toBe('Not studied for 20 days');
    expect(reasonLabel({ kind: 'stale', days: 45 })).toBe('Not studied for 6 weeks');
  });

  it('links straight to the stage', () => {
    expect(reviewHref({ journeyId: 'j 1', stageId: 's/1' })).toBe('/teach-me/journey/j%201?stage=s%2F1');
  });
});

describe('parseReviewItems', () => {
  it('keeps well-formed items and drops the rest', () => {
    const good = { journeyId: 'j1', journeyTopic: 'T', stageId: 's1', stageOrder: 1, stageTitle: 'S', reason: { kind: 'cards', count: 2 } };
    expect(parseReviewItems({ items: [good, { journeyId: 1 }, null] })).toEqual([good]);
    expect(parseReviewItems(null)).toEqual([]);
    expect(parseReviewItems({ error: 'x' })).toEqual([]);
  });
});
