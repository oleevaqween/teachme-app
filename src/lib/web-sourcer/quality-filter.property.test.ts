// Property test for community quality filter
// Task 7.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterByQuality } from './index';
import type { CommunitySource } from './index';

/**
 * Property 20: Community Quality Filter
 *
 * For any set of community sources, the filter SHALL include only communities
 * with member count >= 1000 AND last activity date within the past 12 months.
 * All communities not meeting both criteria SHALL be excluded.
 *
 * **Validates: Requirements 11.2**
 */
describe('Property 20: Community Quality Filter', () => {
  // Generate a random date within the last 3 years
  const dateArb = fc.date({
    min: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
    max: new Date(),
  });

  const communitySourceArb: fc.Arbitrary<CommunitySource> = fc.record({
    communityName: fc.string({ minLength: 1, maxLength: 50 }),
    url: fc.webUrl(),
    content: fc.string({ minLength: 1, maxLength: 200 }),
    memberCount: fc.integer({ min: 0, max: 50000 }),
    lastActivityDate: dateArb,
    topic: fc.string({ minLength: 1, maxLength: 50 }),
  });

  it('output includes ONLY sources where memberCount >= 1000 AND lastActivityDate within 12 months', () => {
    fc.assert(
      fc.property(
        fc.array(communitySourceArb, { minLength: 0, maxLength: 30 }),
        (sources) => {
          const result = filterByQuality(sources);
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

          for (const source of result) {
            expect(source.memberCount).toBeGreaterThanOrEqual(1000);
            expect(source.lastActivityDate.getTime()).toBeGreaterThanOrEqual(
              twelveMonthsAgo.getTime()
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('excludes all sources that do NOT meet both criteria', () => {
    fc.assert(
      fc.property(
        fc.array(communitySourceArb, { minLength: 0, maxLength: 30 }),
        (sources) => {
          const result = filterByQuality(sources);
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

          // Every source NOT in result should fail at least one criterion
          const resultUrls = new Set(result.map((s) => s.url));
          const excluded = sources.filter((s) => !resultUrls.has(s.url));

          for (const source of excluded) {
            const meetsMembers = source.memberCount >= 1000;
            const meetsActivity = source.lastActivityDate >= twelveMonthsAgo;
            // At least one criterion must be unmet
            expect(meetsMembers && meetsActivity).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result count matches manual filtering', () => {
    fc.assert(
      fc.property(
        fc.array(communitySourceArb, { minLength: 0, maxLength: 30 }),
        (sources) => {
          const result = filterByQuality(sources);
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

          const expectedCount = sources.filter(
            (s) => s.memberCount >= 1000 && s.lastActivityDate >= twelveMonthsAgo
          ).length;

          expect(result).toHaveLength(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
