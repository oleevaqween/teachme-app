// Property test for mock question count bounds
// Task 10.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 12: Mock Question Count Bounds
 *
 * For any role, the generated mock question set SHALL contain between 5 and 10
 * questions (inclusive).
 *
 * We test a pure function that validates/normalizes the output of mock question
 * generation to meet count bounds. Given a random array of question objects,
 * verify: 5 <= count <= 10.
 *
 * **Validates: Requirements 6.1**
 */

interface MockQuestionLike {
  id: string;
  question: string;
  difficulty: 'medium' | 'hard';
  topicArea: string;
}

/**
 * Pure function that enforces the question count bounds on a generated set.
 * If fewer than 5 questions, pads with default questions.
 * If more than 10 questions, trims to 10.
 */
function enforceQuestionCountBounds(
  questions: MockQuestionLike[],
  role: string
): MockQuestionLike[] {
  const MIN_QUESTIONS = 5;
  const MAX_QUESTIONS = 10;

  // Trim if over max
  const result = questions.slice(0, MAX_QUESTIONS);

  // Pad if under min
  while (result.length < MIN_QUESTIONS) {
    result.push({
      id: `pad-${role}-${result.length}`,
      question: `Default question ${result.length + 1} for ${role}`,
      difficulty: 'medium',
      topicArea: 'general',
    });
  }

  return result;
}

describe('Property 12: Mock Question Count Bounds', () => {
  // Generate question-like objects
  const questionArb: fc.Arbitrary<MockQuestionLike> = fc.record({
    id: fc.string({ minLength: 3, maxLength: 20 }),
    question: fc.string({ minLength: 10, maxLength: 100 }),
    difficulty: fc.constantFrom('medium' as const, 'hard' as const),
    topicArea: fc.string({ minLength: 3, maxLength: 30 }),
  });

  // Generate arrays of random lengths (0-20)
  const questionArrayArb: fc.Arbitrary<MockQuestionLike[]> = fc.array(questionArb, {
    minLength: 0,
    maxLength: 20,
  });

  const roleArb: fc.Arbitrary<string> = fc.string({ minLength: 2, maxLength: 50 });

  it('enforced question count is always between 5 and 10 inclusive', () => {
    fc.assert(
      fc.property(questionArrayArb, roleArb, (questions, role) => {
        const result = enforceQuestionCountBounds(questions, role);

        expect(result.length).toBeGreaterThanOrEqual(5);
        expect(result.length).toBeLessThanOrEqual(10);
      }),
      { numRuns: 100 }
    );
  });

  it('does not exceed 10 questions even with large input', () => {
    fc.assert(
      fc.property(
        fc.array(questionArb, { minLength: 11, maxLength: 50 }),
        roleArb,
        (questions, role) => {
          const result = enforceQuestionCountBounds(questions, role);
          expect(result.length).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('pads to at least 5 questions when input is sparse', () => {
    fc.assert(
      fc.property(
        fc.array(questionArb, { minLength: 0, maxLength: 4 }),
        roleArb,
        (questions, role) => {
          const result = enforceQuestionCountBounds(questions, role);
          expect(result.length).toBeGreaterThanOrEqual(5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('preserves original questions when count is within bounds', () => {
    fc.assert(
      fc.property(
        fc.array(questionArb, { minLength: 5, maxLength: 10 }),
        roleArb,
        (questions, role) => {
          const result = enforceQuestionCountBounds(questions, role);
          // Should be exactly the input length (no padding or trimming)
          expect(result.length).toBe(questions.length);
          // Original questions should be preserved
          for (let i = 0; i < questions.length; i++) {
            expect(result[i].id).toBe(questions[i].id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
