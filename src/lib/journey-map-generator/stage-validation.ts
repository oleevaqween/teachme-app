// src/lib/journey-map-generator/stage-validation.ts

import type { Stage } from './index';

/**
 * Counts the number of words in a string.
 * Splits on whitespace and filters out empty tokens.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Validates that a Stage[] conforms to the journey map structure constraints:
 * - The array must have between 10 and 15 stages (inclusive)
 * - Every stage must have a summary with a word count between 20 and 80 (inclusive)
 *
 * Returns an object indicating validity and any error descriptions.
 */
export function validateStageStructure(stages: Stage[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate stage count (10-15 inclusive)
  if (stages.length < 10 || stages.length > 15) {
    errors.push(
      `Invalid stage count: expected 10-15 stages, got ${stages.length}`
    );
  }

  // Validate each stage's summary word count (20-80 inclusive)
  for (const stage of stages) {
    const wordCount = countWords(stage.summary);
    if (wordCount < 20 || wordCount > 80) {
      errors.push(
        `Stage "${stage.title}" (order ${stage.order}) has invalid summary word count: expected 20-80 words, got ${wordCount}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
