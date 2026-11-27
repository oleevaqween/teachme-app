// Property test for progress percentage computation
// Task 6.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeProgressPercentage } from './index';

/**
 * Property 6: Progress percentage computation
 *
 * For any journey with totalStages > 0 and completedCount in the range
 * [0, totalStages], the computed percentComplete SHALL equal
 * Math.round((completedCount / totalStages) * 100) and SHALL be in the
 * range [0, 100].
 *
 * **Validates: Requirements 4.7, 8.4**
 */

describe('Property 6: Progress percentage computation', () => {
  it('percentComplete equals Math.round((completedCount / totalStages) * 100) and is in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((totalStages) =>
          fc.tuple(
            fc.constant(totalStages),
            fc.integer({ min: 0, max: totalStages })
          )
        ),
        ([totalStages, completedCount]) => {
          const result = computeProgressPercentage(completedCount, totalStages);
          const expected = Math.round((completedCount / totalStages) * 100);

          // Result equals the expected formula
          expect(result).toBe(expected);

          // Result is in [0, 100]
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });
});
