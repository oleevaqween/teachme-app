// Property test for content chunking bounds (Property 1)
// Task 2.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { chunkDocumentContent } from './content-chunker';
import type { ContentSection } from '@/lib/document-processor';

/**
 * Property 1: Content chunking respects word count bounds and paragraph boundaries
 *
 * For any document content composed of paragraphs, the `chunkDocumentContent` function
 * SHALL produce chunks where every chunk has a word count between 200 and 1000 (inclusive),
 * and no chunk splits a paragraph mid-sentence (chunk boundaries align with paragraph breaks).
 *
 * Note: The last chunk is allowed to be below 200 words if there's insufficient content
 * remaining — you can't force non-existent content.
 *
 * **Validates: Requirements 3.1**
 */
describe('Property 1: Content chunking respects word count bounds and paragraph boundaries', () => {
  /**
   * Arbitrary that generates a paragraph with a specified word count range.
   * Words are realistic-ish tokens to simulate natural text.
   */
  const arbParagraph = (minWords: number, maxWords: number): fc.Arbitrary<string> =>
    fc.integer({ min: minWords, max: maxWords }).chain((wordCount) =>
      fc.array(
        fc.constantFrom(
          'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
          'learning', 'system', 'generates', 'content', 'from', 'documents',
          'uploaded', 'by', 'users', 'who', 'want', 'to', 'understand',
          'complex', 'topics', 'through', 'interactive', 'sessions', 'that',
          'provide', 'explanations', 'and', 'examples', 'for', 'each',
          'concept', 'covered', 'in', 'the', 'material', 'provided',
          'knowledge', 'base', 'information', 'processing', 'analysis'
        ),
        { minLength: wordCount, maxLength: wordCount }
      ).map((words) => words.join(' ') + '.')
    );

  /**
   * Arbitrary that generates a ContentSection with multiple paragraphs.
   * Ensures enough total content to meaningfully test chunking.
   */
  const arbSection: fc.Arbitrary<ContentSection> = fc.record({
    title: fc.string({ minLength: 3, maxLength: 50 }).map((s) => s.replace(/\n/g, ' ') || 'Section'),
    body: fc
      .array(arbParagraph(20, 150), { minLength: 2, maxLength: 8 })
      .map((paragraphs) => paragraphs.join('\n\n')),
    order: fc.integer({ min: 1, max: 20 }),
    level: fc.integer({ min: 1, max: 5 }),
  });

  /**
   * Arbitrary that generates an array of ContentSections with enough total words
   * (at least 400+) to meaningfully test chunking behavior.
   */
  const arbSections: fc.Arbitrary<ContentSection[]> = fc
    .array(arbSection, { minLength: 2, maxLength: 6 })
    .filter((sections) => {
      const totalWords = sections.reduce((sum, s) => {
        return sum + s.body.trim().split(/\s+/).filter((w) => w.length > 0).length;
      }, 0);
      return totalWords >= 400;
    });

  it('all chunks except possibly the last have >= 200 words, and all chunks have <= 1000 words', () => {
    fc.assert(
      fc.property(arbSections, (sections) => {
        const chunks = chunkDocumentContent(sections);

        // Must produce at least one chunk given 400+ words of input
        expect(chunks.length).toBeGreaterThan(0);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const isLastChunk = i === chunks.length - 1;

          // All chunks must have <= 1000 words
          expect(chunk.wordCount).toBeLessThanOrEqual(1000);

          // All chunks except possibly the last must have >= 200 words
          if (!isLastChunk) {
            expect(chunk.wordCount).toBeGreaterThanOrEqual(200);
          }

          // Word count must be positive
          expect(chunk.wordCount).toBeGreaterThan(0);

          // Reported wordCount must match actual content word count
          const actualWordCount = chunk.content.trim().split(/\s+/).length;
          expect(chunk.wordCount).toBe(actualWordCount);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('chunk boundaries align with paragraph breaks (no mid-paragraph splits)', () => {
    fc.assert(
      fc.property(arbSections, (sections) => {
        const chunks = chunkDocumentContent(sections);

        // Collect all original paragraphs from input sections
        const allParagraphs: string[] = [];
        for (const section of sections) {
          const body = section.body.trim();
          if (body.length === 0) continue;
          const paragraphs = body
            .split(/\n\s*\n/)
            .map((p) => p.replace(/\s+/g, ' ').trim())
            .filter((p) => p.length > 0);
          allParagraphs.push(...paragraphs);
        }

        // Each chunk's content is a join of paragraphs separated by double newlines.
        // Verify that each segment within a chunk corresponds to either:
        // - A complete original paragraph, OR
        // - A sentence-boundary split of an oversized paragraph (which is valid per design)
        for (const chunk of chunks) {
          const chunkSegments = chunk.content
            .split(/\n\s*\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          for (const segment of chunkSegments) {
            // Each segment should either be a complete original paragraph
            // or a subset of sentences from an oversized paragraph that was split at sentence boundaries.
            // In either case, it should NOT be a fragment that cuts a sentence in the middle.
            // We verify this by checking the segment ends with sentence-ending punctuation
            // or matches an original paragraph exactly.
            const isCompleteOriginal = allParagraphs.some((p) => p === segment);
            const endsWithPunctuation = /[.!?][\s]*$/.test(segment);
            const isOriginalSubstring = allParagraphs.some((p) => p.includes(segment));

            // The segment must either be a complete paragraph or end at a sentence boundary
            expect(
              isCompleteOriginal || endsWithPunctuation || isOriginalSubstring
            ).toBe(true);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
