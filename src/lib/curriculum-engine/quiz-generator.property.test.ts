// Property test for quiz frequency invariant
// Task 8.5

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { planQuizInsertion } from './quiz-generator';
import type { JourneySection } from './index';

/**
 * Property 6: Quiz Frequency Invariant
 *
 * For any generated Journey with N sections (where N >= 5), the number of
 * embedded quizzes Q SHALL satisfy: ceil(N/5) <= Q <= floor(N/3).
 *
 * **Validates: Requirements 3.3**
 */
describe('Property 6: Quiz Frequency Invariant', () => {
  // Generate a minimal JourneySection for testing quiz planning
  const journeySectionArb: fc.Arbitrary<JourneySection> = fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 3, maxLength: 50 }),
    content: fc.string({ minLength: 10, maxLength: 200 }),
    order: fc.integer({ min: 1, max: 50 }),
    sourceTag: fc.constant('Document-sourced' as const),
    relatedSections: fc.constant([] as string[]),
  });

  it('ceil(N/5) <= totalQuizzes <= floor(N/3) for section counts 5-50', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }).chain((n) =>
          fc.array(journeySectionArb, { minLength: n, maxLength: n })
        ),
        (sections) => {
          const N = sections.length;
          const plan = planQuizInsertion(sections);

          const minQuizzes = Math.ceil(N / 5);
          const maxQuizzes = Math.floor(N / 3);

          expect(plan.totalQuizzes).toBeGreaterThanOrEqual(minQuizzes);
          expect(plan.totalQuizzes).toBeLessThanOrEqual(maxQuizzes);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('insertion points count matches totalQuizzes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }).chain((n) =>
          fc.array(journeySectionArb, { minLength: n, maxLength: n })
        ),
        (sections) => {
          const plan = planQuizInsertion(sections);
          expect(plan.insertionPoints).toHaveLength(plan.totalQuizzes);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all insertion points are valid section indices', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }).chain((n) =>
          fc.array(journeySectionArb, { minLength: n, maxLength: n })
        ),
        (sections) => {
          const N = sections.length;
          const plan = planQuizInsertion(sections);

          for (const point of plan.insertionPoints) {
            expect(point).toBeGreaterThanOrEqual(0);
            expect(point).toBeLessThan(N);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
