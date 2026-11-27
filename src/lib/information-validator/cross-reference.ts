// src/lib/information-validator/cross-reference.ts

/**
 * Cross-reference verification module.
 *
 * Checks if an LLM-generated claim is semantically aligned with the
 * content of a source document. Uses text matching and similarity
 * techniques to determine alignment.
 */

import type { ParsedDocument } from '@/lib/document-processor';

export interface CrossReferenceResult {
  /** Whether the claim is semantically aligned with the source document */
  aligned: boolean;
  /** The section of the document that matched, if any */
  matchedSection?: string;
}

/**
 * Cross-references an LLM-generated claim against a source document.
 * Confirms semantic alignment between the generated claim and the original text.
 *
 * The current implementation uses text-based matching:
 * 1. Exact substring match (case-insensitive) against the full document text
 * 2. Fuzzy keyword overlap — checks if significant words from the claim
 *    appear in the same section of the document
 *
 * @param claim - The LLM-generated factual claim to verify
 * @param sourceDocument - The parsed source document to verify against
 * @returns Result indicating alignment and the matched section (if found)
 */
export async function crossReferenceWithDocument(
  claim: string,
  sourceDocument: ParsedDocument
): Promise<CrossReferenceResult> {
  if (!claim || !claim.trim()) {
    return { aligned: false };
  }

  const normalizedClaim = claim.toLowerCase().trim();
  const documentText = sourceDocument.content.rawText.toLowerCase();

  // Strategy 1: Exact substring match (case-insensitive)
  if (documentText.includes(normalizedClaim)) {
    const matchedSection = findContainingSection(
      normalizedClaim,
      sourceDocument
    );
    return {
      aligned: true,
      matchedSection: matchedSection ?? undefined,
    };
  }

  // Strategy 2: Keyword overlap with sections
  const claimKeywords = extractSignificantWords(normalizedClaim);

  if (claimKeywords.length === 0) {
    return { aligned: false };
  }

  // Check each section for keyword overlap
  for (const section of sourceDocument.content.sections) {
    const sectionText = `${section.title} ${section.body}`.toLowerCase();
    const matchingKeywords = claimKeywords.filter((keyword) =>
      sectionText.includes(keyword)
    );

    // Consider aligned if at least 60% of significant keywords are found in the section
    const overlapRatio = matchingKeywords.length / claimKeywords.length;
    if (overlapRatio >= 0.6) {
      return {
        aligned: true,
        matchedSection: section.title || section.body.slice(0, 100),
      };
    }
  }

  // Strategy 3: Check raw text for keyword overlap as a fallback
  const matchingKeywordsInDoc = claimKeywords.filter((keyword) =>
    documentText.includes(keyword)
  );
  const docOverlapRatio = matchingKeywordsInDoc.length / claimKeywords.length;

  if (docOverlapRatio >= 0.7) {
    return {
      aligned: true,
      matchedSection: findBestMatchingSection(claimKeywords, sourceDocument),
    };
  }

  return { aligned: false };
}

/**
 * Finds the section containing the given text substring.
 */
function findContainingSection(
  text: string,
  document: ParsedDocument
): string | null {
  for (const section of document.content.sections) {
    const sectionText = `${section.title} ${section.body}`.toLowerCase();
    if (sectionText.includes(text)) {
      return section.title || section.body.slice(0, 100);
    }
  }
  return null;
}

/**
 * Finds the section with the highest keyword overlap.
 */
function findBestMatchingSection(
  keywords: string[],
  document: ParsedDocument
): string | undefined {
  let bestSection: string | undefined;
  let bestScore = 0;

  for (const section of document.content.sections) {
    const sectionText = `${section.title} ${section.body}`.toLowerCase();
    const score = keywords.filter((kw) => sectionText.includes(kw)).length;

    if (score > bestScore) {
      bestScore = score;
      bestSection = section.title || section.body.slice(0, 100);
    }
  }

  return bestSection;
}

/**
 * Extracts significant words from text, filtering out common stop words
 * and very short words.
 */
function extractSignificantWords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
    'their', 'what', 'which', 'who', 'whom', 'whose',
  ]);

  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 3 && !stopWords.has(w));
}
