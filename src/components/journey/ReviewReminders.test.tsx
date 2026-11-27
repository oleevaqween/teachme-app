import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReviewList } from './ReviewReminders';
import type { ReviewItem } from '@/lib/progress-tracker/review-reminders';

const item = (stageId: string, reason: ReviewItem['reason']): ReviewItem => ({
  journeyId: 'j1',
  journeyTopic: 'Understanding the PMBOK',
  stageId,
  stageOrder: Number(stageId.slice(1)),
  stageTitle: `Title ${stageId}`,
  reason,
});

describe('ReviewList', () => {
  it('renders nothing when nothing is due', () => {
    expect(renderToStaticMarkup(<ReviewList items={[]} total={0} />)).toBe('');
  });

  it('lists each stage with its reason, linking straight to the stage', () => {
    const html = renderToStaticMarkup(
      <ReviewList items={[item('s3', { kind: 'cards', count: 2 }), item('s1', { kind: 'stale', days: 20 })]} total={2} />
    );
    expect(html).toContain('Due for review');
    expect(html).toContain('Stage 3 · Title s3');
    expect(html).toContain('2 cards due');
    expect(html).toContain('Not studied for 20 days');
    expect(html).toContain('href="/teach-me/journey/j1?stage=s3"');
    expect(html).toContain('Understanding the PMBOK');
    expect(html).not.toContain('more');
  });

  it('says how many more are due beyond the ones shown', () => {
    const html = renderToStaticMarkup(<ReviewList items={[item('s1', { kind: 'cards', count: 1 })]} total={4} />);
    expect(html).toContain('and 3 more');
  });
});
