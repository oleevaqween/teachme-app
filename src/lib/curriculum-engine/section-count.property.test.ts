// Property test for journey section count bounds
// Task 8.7

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildJourneyStructure } from './journey-builder';
import type { ContentSection } from '@/lib/document-processor';
import type { VerifiedSource } from './index';

/**
 * Property 9: Journey Section Count Bounds
 *
 * For any generated Journey, the total section count S SHALL satisfy: 5 ≤ S ≤ 50.
 *
 * We generate random ContentSection arrays (length 1-60) and optional VerifiedSource arrays,
 * then verify the output section count is always within bounds.
 *
 * **Validates: Requirements 3.8**
 */
describe('Property 9: Journey Section Count Bounds', () => {
  const contentSectionArb = (index: number): fc.Arbitrary<ContentSection> =>
    fc.record({
      title: fc.string({ minLength: 3, maxLength: 30 }).map((s) => `Topic-${index}-${s}`),
      body: fc.string({ minLength: 20, maxLength: 300 }),
      order: fc.constant(index + 1),
      level: fc.integer({ min: 1, max: 5 }),
    });

  const contentSectionsArb: fc.Arbitrary<ContentSection[]> = fc
    .integer({ min: 1, max: 60 })
    .chain((len) =>
      fc.tuple(...Array.from({ length: len }, (_, i) => contentSectionArb(i)))
    );

  const verifiedSourceArb: fc.Arbitrary<VerifiedSource> = fc.record({
    url: fc.webUrl(),
    title: fc.string({ minLength: 3, maxLength: 50 }),
    content: fc.string({ minLength: 20, maxLength: 200 }),
    communityName: fc.string({ minLength: 3, maxLength: 30 }),
    confidenceLevel: fc.constantFrom('High' as const, 'Medium' as const, 'Low' as const),
  });

  const verifiedSourcesArb: fc.Arbitrary<VerifiedSource[]> = fc.array(verifiedSourceArb, {
    minLength: 0,
    maxLength: 10,
  });

  it('output section count is always between 5 and 50 inclusive', () => {
    fc.assert(
      fc.property(contentSectionsArb, verifiedSourcesArb, (concepts, sources) => {
        const journeySections = buildJourneyStructure(concepts, sources);

        expect(journeySections.length).toBeGreaterThanOrEqual(5);
        expect(journeySections.length).toBeLessThanOrEqual(50);
      }),
      { numRuns: 100 }
    );
  });
});
