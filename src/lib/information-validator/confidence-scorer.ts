// src/lib/information-validator/confidence-scorer.ts

/**
 * Confidence level assignment logic for verified claims.
 *
 * Confidence levels are determined by the number of independent sources
 * that corroborate a claim:
 * - High: 3 or more sources verified the claim
 * - Medium: exactly 2 sources verified the claim
 * - Low: exactly 1 source verified the claim
 */

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

/**
 * Assigns a confidence level based on the number of corroborating sources.
 *
 * @param sourceCount - The number of independent sources that verified the claim (must be >= 1)
 * @returns The confidence level: 'High' (3+), 'Medium' (2), or 'Low' (1)
 * @throws Error if sourceCount is less than 1
 */
export function assignConfidenceLevel(sourceCount: number): ConfidenceLevel {
  if (sourceCount < 1) {
    throw new Error(
      `Cannot assign confidence level: sourceCount must be at least 1, got ${sourceCount}`
    );
  }

  if (sourceCount >= 3) {
    return 'High';
  }

  if (sourceCount === 2) {
    return 'Medium';
  }

  return 'Low';
}

/**
 * Determines whether a claim meets the minimum verification threshold.
 * A claim is considered verified if at least 1 source corroborates it.
 *
 * @param sourceCount - Number of sources that corroborated the claim
 * @returns true if the claim has at least 1 corroborating source
 */
export function meetsVerificationThreshold(sourceCount: number): boolean {
  return sourceCount >= 1;
}
