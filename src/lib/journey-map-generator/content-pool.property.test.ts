// Property test for unified content pool completeness
// Task 4.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildUnifiedContentPool } from './content-pool';
import type { ParsedDocument, ContentSection } from '@/lib/document-processor';

/**
 * Property 8: Unified content pool completeness
 *
 * For any set of parsed documents, the unified content pool produced by combining
 * their content SHALL contain every ContentSection from every document — no section
 * is dropped during combination.
 *
 * **Validates: Requirements 1.5**
 */
describe('Property 8: Unified content pool completeness', () => {
  // Generator for a single ContentSection
  const contentSectionArb = fc
    .record({
      title: fc.string({ minLength: 1, maxLength: 100 }),
      body: fc.string({ minLength: 1, maxLength: 500 }),
      order: fc.nat({ max: 100 }),
      level: fc.integer({ min: 1, max: 5 }),
    })
    .map(({ title, body, order, level }): ContentSection => ({
      title,
      body,
      order,
      level,
    }));

  // Generator for a ParsedDocument with 1-20 sections
  const parsedDocumentArb = fc
    .record({
      id: fc.uuid(),
      fileName: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `${s}.pdf`),
      sections: fc.array(contentSectionArb, { minLength: 1, maxLength: 20 }),
      rawText: fc.string({ minLength: 0, maxLength: 200 }),
      headings: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
      wordCount: fc.nat({ max: 100000 }),
    })
    .map(({ id, fileName, sections, rawText, headings, wordCount }): ParsedDocument => ({
      id,
      fileName,
      format: 'pdf',
      content: {
        sections,
        rawText,
        headings,
        totalCharacters: rawText.length,
      },
      metadata: {
        wordCount,
      },
      parsedAt: new Date(),
    }));

  // Generator for an array of 1-10 ParsedDocuments
  const documentsArb = fc.array(parsedDocumentArb, { minLength: 1, maxLength: 10 });

  it('output pool length equals sum of all input section lengths', () => {
    fc.assert(
      fc.property(documentsArb, (documents) => {
        const pool = buildUnifiedContentPool(documents);

        const expectedLength = documents.reduce(
          (sum, doc) => sum + doc.content.sections.length,
          0
        );

        expect(pool.length).toBe(expectedLength);
      }),
      { numRuns: 100 }
    );
  });

  it('every section title and body from every document appears in the output pool', () => {
    fc.assert(
      fc.property(documentsArb, (documents) => {
        const pool = buildUnifiedContentPool(documents);

        for (const doc of documents) {
          for (const section of doc.content.sections) {
            const found = pool.some(
              (pooled) =>
                pooled.title === section.title &&
                pooled.body === section.body &&
                pooled.order === section.order &&
                pooled.level === section.level
            );
            expect(found).toBe(true);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('every pooled section retains correct source document metadata', () => {
    fc.assert(
      fc.property(documentsArb, (documents) => {
        const pool = buildUnifiedContentPool(documents);

        for (const doc of documents) {
          const sectionsFromDoc = pool.filter(
            (pooled) => pooled.sourceDocumentId === doc.id
          );

          // The number of sections attributed to this doc matches the input
          expect(sectionsFromDoc.length).toBe(doc.content.sections.length);

          // Each section from this doc has the correct sourceDocument filename
          for (const pooled of sectionsFromDoc) {
            expect(pooled.sourceDocument).toBe(doc.fileName);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('empty documents array produces empty pool', () => {
    const pool = buildUnifiedContentPool([]);
    expect(pool.length).toBe(0);
  });
});
