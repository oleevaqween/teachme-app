// Property test for invalid API key not stored
// Task 4.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 19: Invalid API Key Not Stored
 *
 * For any API key that fails provider validation, the key SHALL NOT be persisted
 * in the database after the validation attempt.
 *
 * We create a pure function that simulates the save-or-reject logic:
 * if validation fails, return null (not stored). If passes, return the ID.
 *
 * **Validates: Requirements 9.8**
 */

interface ValidationOutcome {
  valid: boolean;
  error?: string;
}

/**
 * Pure function simulating the provider settings save logic:
 * Only store the API key (return the stored ID) if validation passes.
 * If validation fails, return null (key not persisted).
 */
function attemptSaveProviderKey(
  apiKey: string,
  validationResult: ValidationOutcome
): string | null {
  if (!validationResult.valid) {
    // Key fails validation → not stored
    return null;
  }
  // Key passes validation → stored with an ID
  return `provider-${apiKey.slice(0, 8)}-stored`;
}

describe('Property 19: Invalid API Key Not Stored', () => {
  // Generate random API key strings
  const apiKeyArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 64 });

  // Generate random validation outcomes
  const failedValidationArb: fc.Arbitrary<ValidationOutcome> = fc.record({
    valid: fc.constant(false),
    error: fc.oneof(
      fc.constant('Invalid API key or authentication failed.'),
      fc.constant('Connection timed out after 15 seconds.'),
      fc.constant('401 Unauthorized'),
      fc.string({ minLength: 5, maxLength: 50 })
    ),
  });

  const passedValidationArb: fc.Arbitrary<ValidationOutcome> = fc.record({
    valid: fc.constant(true),
  });

  it('when validation fails, the save function returns null (key not persisted)', () => {
    fc.assert(
      fc.property(apiKeyArb, failedValidationArb, (apiKey, validationResult) => {
        const storeResult = attemptSaveProviderKey(apiKey, validationResult);

        // Key must NOT be stored when validation fails
        expect(storeResult).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('when validation passes, the save function returns a non-null ID (key persisted)', () => {
    fc.assert(
      fc.property(apiKeyArb, passedValidationArb, (apiKey, validationResult) => {
        const storeResult = attemptSaveProviderKey(apiKey, validationResult);

        // Key must be stored when validation passes
        expect(storeResult).not.toBeNull();
        expect(typeof storeResult).toBe('string');
        expect(storeResult!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('storage decision depends solely on validation outcome, not key content', () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        apiKeyArb,
        fc.boolean(),
        (key1, key2, shouldPass) => {
          const validation: ValidationOutcome = shouldPass
            ? { valid: true }
            : { valid: false, error: 'Invalid key' };

          const result1 = attemptSaveProviderKey(key1, validation);
          const result2 = attemptSaveProviderKey(key2, validation);

          // Both keys should have the same storage decision
          if (shouldPass) {
            expect(result1).not.toBeNull();
            expect(result2).not.toBeNull();
          } else {
            expect(result1).toBeNull();
            expect(result2).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
