// Property test for stage structure validation
// Task 4.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateStageStructure } from './stage-validation';
import type { Stage } from './index';

/**
 * Property 4: Stage structure validation
 *
 * For any generated journey map, the number of stages SHALL be between 10 and 15
 * (inclusive), and every stage SHALL have a summary whose word count is between 20
 * and 80 (inclusive).
 *
 * **Validates: Requirements 2.1, 2.3**
 */

// Helper to generate a summary string with an exact word count in [min, max]
function summaryWithWordCount(min: number, max: number): fc.Arbitrary<string> {
  return fc.integer({ min, max }).chain((wordCount) =>
    fc.array(fc.stringMatching(/^[a-z]{3,10}$/), { minLength: wordCount, maxLength: wordCount })
      .map((words) => words.join(' '))
  );
}

// Generator for a valid Stage with a summary between 20 and 80 words
function validStageArb(order: number): fc.Arbitrary<Stage> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `stage-${order}-${s}`),
    journeyId: fc.constant('journey-test'),
    title: fc.string({ minLength: 1, maxLength: 80 }),
    summary: summaryWithWordCount(20, 80),
    theme: fc.string({ minLength: 1, maxLength: 30 }),
    order: fc.constant(order),
    topicsCovered: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
  });
}

// Generator for valid Stage[] with 10-15 stages
const validStagesArb: fc.Arbitrary<Stage[]> = fc
  .integer({ min: 10, max: 15 })
  .chain((count) => {
    const stageArbs = Array.from({ length: count }, (_, i) => validStageArb(i + 1));
    return fc.tuple(...(stageArbs as [fc.Arbitrary<Stage>, ...fc.Arbitrary<Stage>[]]));
  })
  .map((tuple) => [...(tuple as unknown as Stage[])]);

// Generator for Stage[] with count outside 10-15 (too few or too many)
const invalidCountStagesArb: fc.Arbitrary<Stage[]> = fc
  .oneof(
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 16, max: 25 })
  )
  .chain((count) => {
    if (count === 0) return fc.constant([] as Stage[]);
    const stageArbs = Array.from({ length: count }, (_, i) => validStageArb(i + 1));
    return fc.tuple(...(stageArbs as [fc.Arbitrary<Stage>, ...fc.Arbitrary<Stage>[]]));
  })
  .map((tuple) => {
    if (Array.isArray(tuple) && tuple.length === 0) return [];
    return [...(tuple as unknown as Stage[])];
  });

// Generator for a Stage with summary outside 20-80 words (too short or too long)
function invalidSummaryStageArb(order: number): fc.Arbitrary<Stage> {
  const invalidSummary = fc.oneof(
    summaryWithWordCount(1, 19),  // too few words
    summaryWithWordCount(81, 120) // too many words
  );

  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `stage-${order}-${s}`),
    journeyId: fc.constant('journey-test'),
    title: fc.string({ minLength: 1, maxLength: 80 }),
    summary: invalidSummary,
    theme: fc.string({ minLength: 1, maxLength: 30 }),
    order: fc.constant(order),
    topicsCovered: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
  });
}

// Generator for Stage[] with valid count (10-15) but at least one invalid summary
const invalidSummaryStagesArb: fc.Arbitrary<Stage[]> = fc
  .integer({ min: 10, max: 15 })
  .chain((count) => {
    // Pick a random index to have an invalid summary
    return fc.integer({ min: 0, max: count - 1 }).chain((invalidIdx) => {
      const stageArbs = Array.from({ length: count }, (_, i) =>
        i === invalidIdx ? invalidSummaryStageArb(i + 1) : validStageArb(i + 1)
      );
      return fc.tuple(...(stageArbs as [fc.Arbitrary<Stage>, ...fc.Arbitrary<Stage>[]]));
    });
  })
  .map((tuple) => [...(tuple as unknown as Stage[])]);

describe('Property 4: Stage structure validation', () => {
  it('Valid Stage[] with 10-15 stages and summaries of 20-80 words passes validation', () => {
    fc.assert(
      fc.property(validStagesArb, (stages) => {
        const result = validateStageStructure(stages);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('Stage[] with count outside 10-15 fails validation', () => {
    fc.assert(
      fc.property(invalidCountStagesArb, (stages) => {
        const result = validateStageStructure(stages);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        // Should have an error about stage count
        expect(result.errors.some((e) => e.includes('stage count'))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('Stage[] with valid count but summary outside 20-80 words fails validation', () => {
    fc.assert(
      fc.property(invalidSummaryStagesArb, (stages) => {
        const result = validateStageStructure(stages);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        // Should have an error about summary word count
        expect(result.errors.some((e) => e.includes('summary'))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
