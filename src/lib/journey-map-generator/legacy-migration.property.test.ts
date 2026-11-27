// Property test for legacy journey migration
// Task 15.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { migrateLegacyJourney, type LegacyJourney, type LegacyJourneySection } from './legacy-migration';

/**
 * Property 9: Legacy journey migration produces valid stages
 *
 * For any legacy journey with JourneySection[] entries, the migration function
 * SHALL produce a valid Stage[] where:
 * 1. The number of stages equals the number of legacy sections
 * 2. Every stage has a non-empty title and summary
 * 3. Stage ordering is sequential starting from 1
 *
 * **Validates: Requirements 11.2**
 */

// Generator for a single LegacyJourneySection
const legacySectionArb = (journeyId: string, order: number): fc.Arbitrary<LegacyJourneySection> =>
  fc.record({
    id: fc.uuid(),
    journeyId: fc.constant(journeyId),
    title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    content: fc.string({ minLength: 0, maxLength: 500 }),
    order: fc.constant(order),
    sourceTag: fc.oneof(
      fc.constant('Document-sourced'),
      fc.constant('Internet-sourced'),
      fc.constant('Custom-tag')
    ),
  });

// Generator for a LegacyJourney with 1-30 sections
const legacyJourneyArb: fc.Arbitrary<LegacyJourney> = fc.uuid().chain((journeyId) =>
  fc.integer({ min: 1, max: 30 }).chain((sectionCount) =>
    fc
      .tuple(
        fc.constant(journeyId),
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        fc.tuple(
          ...Array.from({ length: sectionCount }, (_, i) => legacySectionArb(journeyId, i + 1))
        )
      )
      .map(([id, topic, sections]) => ({
        id,
        topic,
        sections: sections as unknown as LegacyJourneySection[],
      }))
  )
);

describe('Property 9: Legacy journey migration produces valid stages', () => {
  it('number of output stages equals the number of legacy sections', () => {
    fc.assert(
      fc.property(legacyJourneyArb, (journey) => {
        const stages = migrateLegacyJourney(journey);
        expect(stages.length).toBe(journey.sections.length);
      }),
      { numRuns: 100 }
    );
  });

  it('every stage has a non-empty title and summary', () => {
    fc.assert(
      fc.property(legacyJourneyArb, (journey) => {
        const stages = migrateLegacyJourney(journey);

        for (const stage of stages) {
          expect(stage.title.length).toBeGreaterThan(0);
          expect(stage.summary.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('stage ordering is sequential starting from 1', () => {
    fc.assert(
      fc.property(legacyJourneyArb, (journey) => {
        const stages = migrateLegacyJourney(journey);

        for (let i = 0; i < stages.length; i++) {
          expect(stages[i].order).toBe(i + 1);
        }
      }),
      { numRuns: 100 }
    );
  });
});
