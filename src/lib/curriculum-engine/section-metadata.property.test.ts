// Property test for journey section metadata completeness
// Task 8.6

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildJourneyStructure } from './journey-builder';
import type { ContentSection } from '@/lib/document-processor';
import type { VerifiedSource } from './index';

/**
 * Property 8: Journey Section Metadata Completeness
 *
 * For any section in a generated Journey, it SHALL have a sourceTag of exactly
 * "Document-sourced" or "Internet-sourced". Additionally, if sourceTag is
 * "Internet-sourced", the section SHALL have a non-null attribution AND a
 * confidence level of "High", "Medium", or "Low".
 *
 * **Validates: Requirements 3.7, 4.4, 4.5**
 */
describe('Property 8: Journey Section Metadata Completeness', () => {
  const contentSectionArb = (index: number): fc.Arbitrary<ContentSection> =>
    fc.record({
      title: fc.string({ minLength: 3, maxLength: 30 }).map((s) => `Doc-${index}-${s}`),
      body: fc.string({ minLength: 20, maxLength: 200 }),
      order: fc.constant(index + 1),
      level: fc.integer({ min: 1, max: 4 }),
    });

  const verifiedSourceArb: fc.Arbitrary<VerifiedSource> = fc.record({
    url: fc.webUrl(),
    title: fc.string({ minLength: 3, maxLength: 50 }),
    content: fc.string({ minLength: 20, maxLength: 200 }),
    communityName: fc.string({ minLength: 3, maxLength: 30 }),
    confidenceLevel: fc.constantFrom('High' as const, 'Medium' as const, 'Low' as const),
  });

  it('every section has sourceTag of exactly "Document-sourced" or "Internet-sourced"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 15 }).chain((len) =>
          fc.tuple(
            fc.tuple(...Array.from({ length: len }, (_, i) => contentSectionArb(i))),
            fc.array(verifiedSourceArb, { minLength: 1, maxLength: 5 })
          )
        ),
        ([concepts, sources]) => {
          const sections = buildJourneyStructure(concepts, sources);

          for (const section of sections) {
            expect(['Document-sourced', 'Internet-sourced']).toContain(section.sourceTag);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Internet-sourced sections have non-null attribution', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 15 }).chain((len) =>
          fc.tuple(
            fc.tuple(...Array.from({ length: len }, (_, i) => contentSectionArb(i))),
            fc.array(verifiedSourceArb, { minLength: 1, maxLength: 5 })
          )
        ),
        ([concepts, sources]) => {
          const sections = buildJourneyStructure(concepts, sources);

          const internetSections = sections.filter(
            (s) => s.sourceTag === 'Internet-sourced'
          );

          for (const section of internetSections) {
            expect(section.attribution).not.toBeNull();
            expect(section.attribution).not.toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Internet-sourced sections have confidenceLevel of "High", "Medium", or "Low"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 15 }).chain((len) =>
          fc.tuple(
            fc.tuple(...Array.from({ length: len }, (_, i) => contentSectionArb(i))),
            fc.array(verifiedSourceArb, { minLength: 1, maxLength: 5 })
          )
        ),
        ([concepts, sources]) => {
          const sections = buildJourneyStructure(concepts, sources);

          const internetSections = sections.filter(
            (s) => s.sourceTag === 'Internet-sourced'
          );

          for (const section of internetSections) {
            expect(['High', 'Medium', 'Low']).toContain(section.confidenceLevel);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
