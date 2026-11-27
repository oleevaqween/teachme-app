import { describe, it, expect } from 'vitest';
import { computeProgressPercentage } from './index';

describe('computeProgressPercentage', () => {
  it('returns 0 when totalStages is 0 (division by zero guard)', () => {
    expect(computeProgressPercentage(0, 0)).toBe(0);
    expect(computeProgressPercentage(5, 0)).toBe(0);
  });

  it('returns 0 when totalStages is negative', () => {
    expect(computeProgressPercentage(3, -1)).toBe(0);
  });

  it('returns 0 when no stages are completed', () => {
    expect(computeProgressPercentage(0, 10)).toBe(0);
  });

  it('returns 100 when all stages are completed', () => {
    expect(computeProgressPercentage(10, 10)).toBe(100);
  });

  it('returns correct rounded percentage for partial completion', () => {
    // 1/3 = 33.33... → rounds to 33
    expect(computeProgressPercentage(1, 3)).toBe(33);
    // 2/3 = 66.66... → rounds to 67
    expect(computeProgressPercentage(2, 3)).toBe(67);
    // 1/2 = 50
    expect(computeProgressPercentage(1, 2)).toBe(50);
  });

  it('clamps result to 100 even if completedCount exceeds totalStages', () => {
    // completedCount > totalStages should still return at most 100
    expect(computeProgressPercentage(15, 10)).toBe(100);
  });

  it('clamps result to 0 for negative completedCount', () => {
    expect(computeProgressPercentage(-5, 10)).toBe(0);
  });
});
