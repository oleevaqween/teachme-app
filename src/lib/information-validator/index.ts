// src/lib/information-validator/index.ts

import type { ParsedDocument } from '@/lib/document-processor';
import { searchWeb } from './web-search';
import { assignConfidenceLevel, meetsVerificationThreshold } from './confidence-scorer';
import { crossReferenceWithDocument as crossRef } from './cross-reference';

export interface VerificationResult {
  claim: string;
  verified: boolean;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  sources: VerificationSource[];
  timedOut: boolean;
}

export interface VerificationSource {
  url: string;
  title: string;
  available: boolean;
}

export type SourceTag = 'Document-sourced' | 'Internet-sourced';

/**
 * Verifies a factual claim against independent sources.
 * Times out after 30 seconds, excluding unverified claims.
 *
 * Confidence levels:
 * - High: verified by 3+ sources
 * - Medium: verified by 2 sources
 * - Low: verified by 1 source
 *
 * @param claim - The factual claim to verify
 * @param timeout - Timeout in milliseconds (default 30000ms)
 * @returns Verification result with sources and confidence level
 */
export async function verifyClaim(
  claim: string,
  timeout: number = 30000
): Promise<VerificationResult> {
  // Set up abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Search the web for corroborating sources
    const searchResults = await searchWeb(claim, {
      maxResults: 5,
      signal: controller.signal,
    });

    // Filter to only available sources
    const availableSources: VerificationSource[] = [];

    for (const result of searchResults) {
      // If a source is unavailable or errors, proceed with remaining sources (Req 4.6)
      if (result.available) {
        availableSources.push({
          url: result.url,
          title: result.title,
          available: true,
        });
      } else {
        availableSources.push({
          url: result.url,
          title: result.title,
          available: false,
        });
      }
    }

    // Count only available sources for verification
    const verifiedSourceCount = availableSources.filter((s) => s.available).length;

    // Determine if claim is verified (at least 1 source)
    const verified = meetsVerificationThreshold(verifiedSourceCount);

    // Assign confidence level based on verified source count
    const confidenceLevel = verified
      ? assignConfidenceLevel(verifiedSourceCount)
      : 'Low';

    return {
      claim,
      verified,
      confidenceLevel,
      sources: availableSources,
      timedOut: false,
    };
  } catch (error: unknown) {
    // Handle timeout (AbortError)
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('aborted'))
    ) {
      return {
        claim,
        verified: false,
        confidenceLevel: 'Low',
        sources: [],
        timedOut: true,
      };
    }

    // For any other error, mark as unverified
    return {
      claim,
      verified: false,
      confidenceLevel: 'Low',
      sources: [],
      timedOut: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Cross-references LLM-generated content against source documents.
 * Confirms semantic alignment between generated claim and original text.
 *
 * @param claim - The LLM-generated factual claim to verify
 * @param sourceDocument - The parsed source document to verify against
 * @returns Result indicating alignment and the matched section (if found)
 */
export async function crossReferenceWithDocument(
  claim: string,
  sourceDocument: ParsedDocument
): Promise<{ aligned: boolean; matchedSection?: string }> {
  return crossRef(claim, sourceDocument);
}

/**
 * Batch verifies multiple claims in parallel.
 * Uses Promise.allSettled to ensure all claims are processed even if some fail.
 * Returns results for all claims — only verified claims should be used in output.
 *
 * @param claims - Array of factual claims to verify
 * @returns Array of verification results (includes both verified and unverified)
 */
export async function verifyBatch(
  claims: string[]
): Promise<VerificationResult[]> {
  if (claims.length === 0) {
    return [];
  }

  // Run all verifications in parallel using Promise.allSettled
  const settledResults = await Promise.allSettled(
    claims.map((claim) => verifyClaim(claim))
  );

  // Map settled results to VerificationResults
  const results: VerificationResult[] = settledResults.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    // If a verification promise rejected (unexpected), mark as unverified
    return {
      claim: claims[index],
      verified: false,
      confidenceLevel: 'Low' as const,
      sources: [],
      timedOut: false,
    };
  });

  return results;
}
