// Property test for grounded prompt includes all chunks
// Task 7.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildGroundedPrompt } from './grounding-engine';
import type { ContentChunk } from '@/lib/journey-map-generator';

/**
 * Property 10: Grounded prompt includes stage chunk content
 *
 * For any non-empty array of ContentChunk objects and a user message,
 * the buildGroundedPrompt function SHALL produce a prompt whose context
 * includes text from every provided chunk — no chunk is silently excluded
 * from the grounding context.
 *
 * **Validates: Requirements 6.1**
 */
describe('Property 10: Grounded prompt includes stage chunk content', () => {
  // Generator for a single ContentChunk with unique content
  const contentChunkArb = (index: number) =>
    fc
      .record({
        id: fc.uuid(),
        stageId: fc.uuid(),
        journeyId: fc.uuid(),
        content: fc.string({ minLength: 10, maxLength: 200 }).map(
          (s) => `unique_chunk_${index}_${s.replace(/[^\w\s]/g, 'x')}`
        ),
        sourceDocument: fc.string({ minLength: 1, maxLength: 50 }).map(
          (s) => `doc_${s.replace(/[^\w]/g, '')}.pdf`
        ),
        sourceSection: fc.string({ minLength: 1, maxLength: 50 }).map(
          (s) => `section_${s.replace(/[^\w]/g, '')}`
        ),
        order: fc.constant(index),
        wordCount: fc.integer({ min: 200, max: 1000 }),
      })
      .map(
        (rec): ContentChunk => ({
          id: rec.id,
          stageId: rec.stageId,
          journeyId: rec.journeyId,
          content: rec.content,
          sourceDocument: rec.sourceDocument,
          sourceSection: rec.sourceSection,
          order: rec.order,
          wordCount: rec.wordCount,
        })
      );

  // Generator for non-empty array of ContentChunks (1-10 chunks, each with unique content)
  const chunksArb = fc
    .integer({ min: 1, max: 10 })
    .chain((size) =>
      fc.tuple(
        ...Array.from({ length: size }, (_, i) => contentChunkArb(i))
      )
    )
    .map((tuple) => tuple as unknown as ContentChunk[]);

  // Generator for user message strings
  const userMessageArb = fc.string({ minLength: 1, maxLength: 200 });

  it('systemPrompt contains the content text from every chunk', async () => {
    await fc.assert(
      fc.asyncProperty(chunksArb, userMessageArb, async (chunks, userMessage) => {
        // Call buildGroundedPrompt with no Tavily and no history
        const result = await buildGroundedPrompt(chunks, userMessage, [], undefined);

        // Verify that result.systemPrompt contains the content text from every chunk
        for (const chunk of chunks) {
          expect(result.systemPrompt).toContain(chunk.content);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('contextChunks equals the input chunks', async () => {
    await fc.assert(
      fc.asyncProperty(chunksArb, userMessageArb, async (chunks, userMessage) => {
        // Call buildGroundedPrompt with no Tavily and no history
        const result = await buildGroundedPrompt(chunks, userMessage, [], undefined);

        // Verify that result.contextChunks equals the input chunks
        expect(result.contextChunks).toEqual(chunks);
      }),
      { numRuns: 100 }
    );
  });
});
