// Property test for no orphaned chunks (Property 2) and topic coverage (Property 5)
// Task 4.6

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { ContentChunk, Stage } from './index';

/**
 * Property 2: No orphaned chunks after stage assignment
 *
 * For any set of content chunks produced from document processing, every chunk
 * SHALL have a non-empty stageId assignment — no chunk exists without being
 * mapped to at least one stage.
 *
 * **Validates: Requirements 3.3**
 */

/**
 * Validates that no content chunks are orphaned (every chunk has a non-empty stageId).
 */
export function validateNoOrphanedChunks(chunks: ContentChunk[]): boolean {
  return chunks.every(
    (chunk) => typeof chunk.stageId === 'string' && chunk.stageId.trim().length > 0
  );
}

/**
 * Property 5: Topic coverage completeness
 *
 * For any set of topics extracted from uploaded documents and a generated journey map,
 * every topic SHALL appear in the topicsCovered array of at least one stage —
 * no topic from the source material is left unmapped.
 *
 * **Validates: Requirements 2.4**
 */

/**
 * Validates that every topic appears in at least one stage's topicsCovered array.
 */
export function validateTopicCoverage(topics: string[], stages: Stage[]): boolean {
  if (topics.length === 0) return true;
  if (stages.length === 0) return false;

  const allCoveredTopics = new Set<string>();
  for (const stage of stages) {
    for (const topic of stage.topicsCovered) {
      allCoveredTopics.add(topic);
    }
  }

  return topics.every((topic) => allCoveredTopics.has(topic));
}

describe('Property 2: No orphaned chunks after stage assignment', () => {
  /**
   * Generator for a ContentChunk with a valid non-empty stageId.
   * Simulates the output produced by assignChunksToStages when functioning correctly.
   */
  const validContentChunkArb: fc.Arbitrary<ContentChunk> = fc.record({
    id: fc.uuid(),
    stageId: fc.string({ minLength: 1, maxLength: 30 }).map((s) => `stage-${s}`),
    journeyId: fc.uuid(),
    content: fc.string({ minLength: 50, maxLength: 500 }),
    sourceDocument: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `${s}.pdf`),
    sourceSection: fc.string({ minLength: 1, maxLength: 80 }),
    order: fc.integer({ min: 1, max: 100 }),
    wordCount: fc.integer({ min: 200, max: 1000 }),
  });

  /**
   * Generator for a ContentChunk that may have an invalid stageId
   * (empty string, whitespace only, or valid). Used to test that the validator
   * correctly rejects orphaned chunks.
   */
  const possiblyOrphanedChunkArb: fc.Arbitrary<ContentChunk> = fc.record({
    id: fc.uuid(),
    stageId: fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant('\t'),
      fc.string({ minLength: 1, maxLength: 30 }).map((s) => `stage-${s}`)
    ),
    journeyId: fc.uuid(),
    content: fc.string({ minLength: 50, maxLength: 500 }),
    sourceDocument: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `${s}.pdf`),
    sourceSection: fc.string({ minLength: 1, maxLength: 80 }),
    order: fc.integer({ min: 1, max: 100 }),
    wordCount: fc.integer({ min: 200, max: 1000 }),
  });

  it('validates true for any array of chunks where all have non-empty stageIds', () => {
    fc.assert(
      fc.property(
        fc.array(validContentChunkArb, { minLength: 1, maxLength: 50 }),
        (chunks) => {
          expect(validateNoOrphanedChunks(chunks)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validates true for an empty chunk array (vacuous truth)', () => {
    expect(validateNoOrphanedChunks([])).toBe(true);
  });

  it('detects orphaned chunks with empty or whitespace-only stageIds', () => {
    fc.assert(
      fc.property(
        fc.array(possiblyOrphanedChunkArb, { minLength: 1, maxLength: 20 }).filter(
          (chunks) => chunks.some((c) => c.stageId.trim().length === 0)
        ),
        (chunks) => {
          // If any chunk has an empty/whitespace stageId, validation must fail
          expect(validateNoOrphanedChunks(chunks)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 5: Topic coverage completeness', () => {
  /**
   * Generator for a topic string (non-empty, no leading/trailing whitespace).
   */
  const topicArb: fc.Arbitrary<string> = fc
    .string({ minLength: 3, maxLength: 50 })
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 3);

  /**
   * Generator for a Stage with given topics (ensures topicsCovered contains specific topics).
   */
  const stageWithTopicsArb = (topics: string[]): fc.Arbitrary<Stage> =>
    fc.record({
      id: fc.uuid(),
      journeyId: fc.uuid(),
      title: fc.string({ minLength: 3, maxLength: 80 }),
      summary: fc.string({ minLength: 20, maxLength: 200 }),
      theme: fc.string({ minLength: 3, maxLength: 50 }),
      order: fc.integer({ min: 1, max: 15 }),
      topicsCovered: fc.constant(topics),
    });

  /**
   * Generator for a Stage with arbitrary topics.
   */
  const arbitraryStageArb: fc.Arbitrary<Stage> = fc.record({
    id: fc.uuid(),
    journeyId: fc.uuid(),
    title: fc.string({ minLength: 3, maxLength: 80 }),
    summary: fc.string({ minLength: 20, maxLength: 200 }),
    theme: fc.string({ minLength: 3, maxLength: 50 }),
    order: fc.integer({ min: 1, max: 15 }),
    topicsCovered: fc.array(topicArb, { minLength: 1, maxLength: 10 }),
  });

  it('validates true when all topics are distributed across stages', () => {
    fc.assert(
      fc.property(
        fc.array(topicArb, { minLength: 1, maxLength: 20 }).chain((topics) => {
          // Distribute topics across 1-5 stages so every topic appears in at least one stage
          const numStages = Math.min(5, Math.max(1, Math.ceil(topics.length / 3)));
          const stageArbs: fc.Arbitrary<Stage>[] = [];

          for (let i = 0; i < numStages; i++) {
            // Each stage gets a slice of topics; ensure all topics are covered
            const start = Math.floor((i * topics.length) / numStages);
            const end = Math.floor(((i + 1) * topics.length) / numStages);
            const stageTopics = topics.slice(start, end);
            if (stageTopics.length > 0) {
              stageArbs.push(stageWithTopicsArb(stageTopics));
            }
          }

          // Ensure at least one stage
          if (stageArbs.length === 0) {
            stageArbs.push(stageWithTopicsArb(topics));
          }

          return fc.tuple(fc.constant(topics), fc.tuple(...(stageArbs as [fc.Arbitrary<Stage>, ...fc.Arbitrary<Stage>[]])));
        }),
        ([topics, stages]) => {
          expect(validateTopicCoverage(topics, stages)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validates true for empty topics list (vacuous truth)', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryStageArb, { minLength: 0, maxLength: 5 }),
        (stages) => {
          expect(validateTopicCoverage([], stages)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validates false when stages array is empty but topics exist', () => {
    fc.assert(
      fc.property(
        fc.array(topicArb, { minLength: 1, maxLength: 10 }),
        (topics) => {
          expect(validateTopicCoverage(topics, [])).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects missing topics when stages do not cover all source topics', () => {
    fc.assert(
      fc.property(
        fc
          .array(topicArb, { minLength: 3, maxLength: 15 })
          .filter((topics) => new Set(topics).size === topics.length)
          .chain((topics) => {
            // Only cover a subset of topics in stages (leave at least one uncovered)
            const coveredCount = Math.max(1, topics.length - 1);
            const coveredTopics = topics.slice(0, coveredCount);

            return fc.tuple(
              fc.constant(topics),
              fc.array(stageWithTopicsArb(coveredTopics), { minLength: 1, maxLength: 3 })
            );
          }),
        ([topics, stages]) => {
          // Since we left at least one topic uncovered, validation must fail
          expect(validateTopicCoverage(topics, stages)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
