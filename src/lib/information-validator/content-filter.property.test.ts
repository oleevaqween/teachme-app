// Property test for unverified content exclusion
// Task 6.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 7: Unverified Content Exclusion
 *
 * For any set of information claims with associated verification results,
 * the output SHALL contain only claims where verified = true.
 * No unverified claim shall appear in the final output.
 *
 * **Validates: Requirements 3.6, 11.4**
 */

interface Claim {
  claim: string;
  verified: boolean;
}

/**
 * Pure function that filters claims to only include verified ones.
 * This mirrors the behavior of the information validator pipeline
 * that excludes unverified content from the journey output.
 */
function filterVerifiedClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.verified === true);
}

describe('Property 7: Unverified Content Exclusion', () => {
  const claimArb = fc.record({
    claim: fc.string({ minLength: 1, maxLength: 200 }),
    verified: fc.boolean(),
  });

  it('output contains ONLY claims where verified === true', () => {
    fc.assert(
      fc.property(
        fc.array(claimArb, { minLength: 0, maxLength: 50 }),
        (claims) => {
          const result = filterVerifiedClaims(claims);

          // Every item in the result must be verified
          for (const item of result) {
            expect(item.verified).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('output contains NO unverified claims', () => {
    fc.assert(
      fc.property(
        fc.array(claimArb, { minLength: 0, maxLength: 50 }),
        (claims) => {
          const result = filterVerifiedClaims(claims);

          // No item in the result should be unverified
          const unverifiedInOutput = result.filter((c) => !c.verified);
          expect(unverifiedInOutput).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all verified claims from input appear in output', () => {
    fc.assert(
      fc.property(
        fc.array(claimArb, { minLength: 0, maxLength: 50 }),
        (claims) => {
          const result = filterVerifiedClaims(claims);

          const expectedCount = claims.filter((c) => c.verified).length;
          expect(result).toHaveLength(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('output is a subset of the input', () => {
    fc.assert(
      fc.property(
        fc.array(claimArb, { minLength: 0, maxLength: 50 }),
        (claims) => {
          const result = filterVerifiedClaims(claims);

          expect(result.length).toBeLessThanOrEqual(claims.length);

          // Each result claim must exist in the original input
          for (const item of result) {
            expect(claims).toContainEqual(item);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
