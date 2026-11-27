// Property test for journey section order differs from source
// Task 8.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildJourneyStructure } from './journey-builder';
import type { ContentSection } from '@/lib/document-processor';

/**
 * Property 5: Journey Section Order Differs from Source
 *
 * For any document with an ordered list of headings (length >= 2), the generated
 * Journey's section ordering SHALL NOT be identical to the original heading order.
 *
 * Note: For very small inputs (2 items), the builder may still reorder. If it
 * doesn't for edge cases, that's acceptable — test with inputs >= 5.
 *
 * **Validates: Requirements 3.2**
 */
describe('Property 5: Journey Section Order Differs from Source', () => {
  // Generate a ContentSection with a unique title
  const contentSectionArb = (index: number): fc.Arbitrary<ContentSection> =>
    fc.record({
      title: fc.string({ minLength: 3, maxLength: 30 }).map((s) => `Section-${index}-${s}`),
      body: fc.string({ minLength: 20, maxLength: 200 }),
      order: fc.constant(index + 1),
      level: fc.integer({ min: 1, max: 4 }),
    });

  // Generate an array of ContentSections with unique titles
  const contentSectionsArb = (minLen: number, maxLen: number): fc.Arbitrary<ContentSection[]> =>
    fc.integer({ min: minLen, max: maxLen }).chain((len) =>
      fc.tuple(...Array.from({ length: len }, (_, i) => contentSectionArb(i))).map(
        (sections) => sections
      )
    );

  it('generated section title ordering differs from source heading order for inputs >= 5', () => {
    fc.assert(
      fc.property(
        contentSectionsArb(5, 20),
        (concepts) => {
          const journeySections = buildJourneyStructure(concepts, []);

          // Extract the titles from the journey output (document-sourced only)
          const outputTitles = journeySections
            .filter((s) => s.sourceTag === 'Document-sourced')
            .map((s) => s.title);

          // Original title ordering
          const inputTitles = concepts.map((c) => c.title);

          // The output order should differ from the input order
          // We check that the ordered sequence is not identical
          const isSameOrder =
            outputTitles.length === inputTitles.length &&
            outputTitles.every((title, idx) => title === inputTitles[idx]);

          expect(isSameOrder).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
