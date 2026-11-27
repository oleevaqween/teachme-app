// Property test for sequential stage unlock logic
// Task 6.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeStageStatuses } from './index';
import type { Stage } from '@/lib/journey-map-generator';

/**
 * Property 3: Sequential stage unlock logic
 *
 * For any journey with N stages and a set of completed stage IDs,
 * the `computeStageStatuses` function SHALL produce statuses where:
 * 1. Stage 1 is always unlocked or completed
 * 2. Stage K (K > 1) is unlocked only if stage K-1 is completed
 * 3. No stage after the first incomplete stage is unlocked
 *
 * **Validates: Requirements 4.5, 8.3**
 */

// Generator for a stage with a given order
function stageArb(order: number): fc.Arbitrary<Stage> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `stage-${order}-${s}`),
    journeyId: fc.constant('journey-test'),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    summary: fc.string({ minLength: 5, maxLength: 100 }),
    theme: fc.string({ minLength: 1, maxLength: 30 }),
    order: fc.constant(order),
    topicsCovered: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  });
}

// Generator for an array of stages with sequential orders (1 to N, N in [1, 20])
const stagesArb: fc.Arbitrary<Stage[]> = fc
  .integer({ min: 1, max: 20 })
  .chain((count) => {
    const stageArbs = Array.from({ length: count }, (_, i) => stageArb(i + 1));
    return fc.tuple(...(stageArbs as [fc.Arbitrary<Stage>, ...fc.Arbitrary<Stage>[]]));
  })
  .map((tuple) => tuple as unknown as Stage[]);

// Generator for a completion set: a contiguous prefix of stages (sorted by order)
// completed from stage 1 up to some stage K. This models real-world usage where
// stages are completed sequentially.
function completionsArb(stages: Stage[]): fc.Arbitrary<{ stageId: string; completedAt: Date }[]> {
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  // Pick how many stages from the beginning are completed (0 to all)
  return fc.integer({ min: 0, max: sortedStages.length }).map((count) =>
    sortedStages.slice(0, count).map((stage) => ({
      stageId: stage.id,
      completedAt: new Date('2024-01-01'),
    }))
  );
}

describe('Property 3: Sequential stage unlock logic', () => {
  it('Invariant 1: Stage 1 (first by order) is always unlocked or completed', () => {
    fc.assert(
      fc.property(
        stagesArb.chain((stages) =>
          completionsArb(stages).map((completions) => ({ stages, completions }))
        ),
        ({ stages, completions }) => {
          const result = computeStageStatuses(stages, completions);

          // Find the first stage by order
          const firstStage = result.find(
            (sp) => sp.stageId === [...stages].sort((a, b) => a.order - b.order)[0].id
          );

          expect(firstStage).toBeDefined();
          expect(['unlocked', 'completed']).toContain(firstStage!.status);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Invariant 2: Stage K (K > 1) is unlocked only if stage K-1 is completed', () => {
    fc.assert(
      fc.property(
        stagesArb.chain((stages) =>
          completionsArb(stages).map((completions) => ({ stages, completions }))
        ),
        ({ stages, completions }) => {
          const result = computeStageStatuses(stages, completions);
          const sortedStages = [...stages].sort((a, b) => a.order - b.order);

          for (let i = 1; i < sortedStages.length; i++) {
            const currentStatus = result.find((sp) => sp.stageId === sortedStages[i].id);
            const previousStatus = result.find((sp) => sp.stageId === sortedStages[i - 1].id);

            expect(currentStatus).toBeDefined();
            expect(previousStatus).toBeDefined();

            if (currentStatus!.status === 'unlocked') {
              // If stage K is unlocked, stage K-1 MUST be completed
              expect(previousStatus!.status).toBe('completed');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Invariant 3: No stage after the first incomplete stage is unlocked', () => {
    fc.assert(
      fc.property(
        stagesArb.chain((stages) =>
          completionsArb(stages).map((completions) => ({ stages, completions }))
        ),
        ({ stages, completions }) => {
          const result = computeStageStatuses(stages, completions);
          const sortedStages = [...stages].sort((a, b) => a.order - b.order);

          // Find the index of the first stage that is NOT completed
          const firstIncompleteIdx = sortedStages.findIndex((stage) => {
            const sp = result.find((r) => r.stageId === stage.id);
            return sp!.status !== 'completed';
          });

          if (firstIncompleteIdx === -1) {
            // All stages are completed — nothing to check
            return;
          }

          // All stages AFTER the first incomplete stage must NOT be unlocked
          for (let i = firstIncompleteIdx + 1; i < sortedStages.length; i++) {
            const sp = result.find((r) => r.stageId === sortedStages[i].id);
            expect(sp).toBeDefined();
            expect(sp!.status).not.toBe('unlocked');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
