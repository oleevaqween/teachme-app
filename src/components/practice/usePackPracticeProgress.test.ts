import { describe, expect, it } from 'vitest';
import { practiceBadge } from './usePackPracticeProgress';

describe('practiceBadge', () => {
  it('describes practice progress for a pack question', () => {
    expect(practiceBadge(undefined)).toBe('Not practised yet');
    expect(practiceBadge({ attempts: 0, best: null })).toBe('Not practised yet');
    expect(practiceBadge({ attempts: 3, best: 8 })).toBe('Practised 3× · best 8/10');
  });
});
