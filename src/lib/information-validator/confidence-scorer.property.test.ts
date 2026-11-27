// Property test for confidence level assignment
// Task 6.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { assignConfidenceLevel } from './confidence-scorer';

/**
 * Property 10: Confidence Level Assignment
 *
 * For any number of verification sources N (where N ≥ 1), the confidence level
 * SHALL be assigned as: High if N ≥ 3, Medium if N = 2, Low if N = 1.
 *
 * **Validates: Requirements 4.5**
 */
describe('Property 10: Confidence Level Assignment', () => {
  it('assigns High confidence when source count >= 3', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 100 }),
        (sourceCount) => {
          const level = assignConfidenceLevel(sourceCount);
          expect(level).toBe('High');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('assigns Medium confidence when source count = 2', () => {
    // This is deterministic but included for completeness with the property contract
    const level = assignConfidenceLevel(2);
    expect(level).toBe('Medium');
  });

  it('assigns Low confidence when source count = 1', () => {
    // This is deterministic but included for completeness with the property contract
    const level = assignConfidenceLevel(1);
    expect(level).toBe('Low');
  });

  it('correctly maps any source count N>=1 to the right confidence level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (sourceCount) => {
          const level = assignConfidenceLevel(sourceCount);

          if (sourceCount >= 3) {
            expect(level).toBe('High');
          } else if (sourceCount === 2) {
            expect(level).toBe('Medium');
          } else {
            expect(level).toBe('Low');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
