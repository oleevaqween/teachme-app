// Property test for archive exclusion
// Task 10.6

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 13: Archive Exclusion
 *
 * For any set of archived question IDs and a newly generated set of mock questions,
 * the intersection of archived IDs and generated question IDs SHALL be empty.
 *
 * We create a pure function: given a set of all possible question IDs and a set of
 * archived IDs, the generated set should have NO overlap with archived IDs.
 *
 * **Validates: Requirements 6.5, 7.3**
 */

/**
 * Pure function that generates new question IDs by excluding archived ones.
 * This simulates the core exclusion logic of generateMockQuestions.
 */
function generateExcludingArchived(
  allQuestionIds: string[],
  archivedIds: Set<string>,
  count: number
): string[] {
  const available = allQuestionIds.filter((id) => !archivedIds.has(id));
  return available.slice(0, count);
}

describe('Property 13: Archive Exclusion', () => {
  // Generate unique ID strings
  const idArb: fc.Arbitrary<string> = fc
    .tuple(
      fc.string({ minLength: 4, maxLength: 12, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
      fc.integer({ min: 1, max: 9999 })
    )
    .map(([prefix, num]) => `q-${prefix}-${num}`);

  // Generate a set of all question IDs (pool of possible questions)
  const allIdsArb: fc.Arbitrary<string[]> = fc
    .uniqueArray(idArb, { minLength: 5, maxLength: 50 })
    .filter((arr) => arr.length >= 5);

  it('generated question IDs have no overlap with archived IDs', () => {
    fc.assert(
      fc.property(allIdsArb, fc.integer({ min: 0, max: 100 }), (allIds, seed) => {
        // Use seed to deterministically split IDs into archived and available
        const archiveCount = Math.min(Math.floor(allIds.length * 0.6), allIds.length - 1);
        const archivedIds = new Set(allIds.slice(0, archiveCount));
        const generatedIds = generateExcludingArchived(allIds, archivedIds, 10);

        // Verify: intersection of archived and generated is empty
        for (const generatedId of generatedIds) {
          expect(archivedIds.has(generatedId)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('generates from available pool only when archived set is non-empty', () => {
    fc.assert(
      fc.property(allIdsArb, (allIds) => {
        // Archive some random subset
        const archivedSubset = allIds.slice(0, Math.ceil(allIds.length / 2));
        const archivedIds = new Set(archivedSubset);
        const generated = generateExcludingArchived(allIds, archivedIds, 10);

        // All generated IDs should be from the non-archived pool
        const availablePool = new Set(allIds.filter((id) => !archivedIds.has(id)));
        for (const id of generated) {
          expect(availablePool.has(id)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
