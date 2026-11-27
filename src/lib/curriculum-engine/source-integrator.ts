// src/lib/curriculum-engine/source-integrator.ts

import type { CommunitySource } from '@/lib/web-sourcer';
import type { VerificationResult } from '@/lib/information-validator';
import type { VerifiedSource, JourneySection, SourceAttribution } from './index';

/**
 * Maps community source results to the VerifiedSource format
 * by cross-referencing with verification results.
 *
 * Only sources whose content passes verification are included.
 * Handles graceful degradation when no sources pass validation.
 */
export function mapToVerifiedSources(
  communitySources: CommunitySource[],
  verificationResults: VerificationResult[]
): VerifiedSource[] {
  if (communitySources.length === 0 || verificationResults.length === 0) {
    return [];
  }

  const verifiedSources: VerifiedSource[] = [];

  for (let i = 0; i < communitySources.length; i++) {
    const source = communitySources[i];
    const verification = verificationResults[i];

    // Only include sources that passed verification
    if (verification && verification.verified) {
      verifiedSources.push({
        url: source.url,
        title: `${source.topic} — ${source.communityName}`,
        content: source.content,
        communityName: source.communityName,
        confidenceLevel: verification.confidenceLevel,
      });
    }
  }

  return verifiedSources;
}

/**
 * Integrates verified community sources into journey sections.
 * For each internet-sourced section, ensures it has proper attribution
 * and confidence level tagging.
 *
 * This function is called after buildJourneyStructure() has already
 * positioned internet-sourced sections near matching document themes.
 * It ensures all metadata fields are properly populated.
 */
export function integrateSources(
  sections: JourneySection[],
  verifiedSources: VerifiedSource[]
): JourneySection[] {
  // Build a lookup of verified sources by URL for quick access
  const sourceByUrl = new Map<string, VerifiedSource>();
  for (const source of verifiedSources) {
    sourceByUrl.set(source.url, source);
  }

  return sections.map((section) => {
    if (section.sourceTag === 'Internet-sourced') {
      // Ensure internet-sourced sections have attribution and confidence level
      const matchedSource = findMatchingSource(section, verifiedSources);

      if (matchedSource) {
        return {
          ...section,
          confidenceLevel: matchedSource.confidenceLevel,
          attribution: {
            name: matchedSource.communityName,
            url: matchedSource.url,
            type: 'community' as const,
          },
        };
      }

      // Fallback: if no matching source found but section is internet-sourced,
      // ensure it still has minimum metadata
      if (!section.attribution) {
        return {
          ...section,
          confidenceLevel: section.confidenceLevel ?? 'Low',
          attribution: {
            name: 'Internet Source',
            type: 'community' as const,
          },
        };
      }
    }

    return section;
  });
}

/**
 * Finds the verified source that best matches a given section
 * by comparing content similarity.
 */
function findMatchingSource(
  section: JourneySection,
  verifiedSources: VerifiedSource[]
): VerifiedSource | undefined {
  // First try exact content match
  for (const source of verifiedSources) {
    if (section.content === source.content) {
      return source;
    }
  }

  // Then try partial content overlap (source content is contained in section)
  for (const source of verifiedSources) {
    if (
      section.content.includes(source.content) ||
      source.content.includes(section.content)
    ) {
      return source;
    }
  }

  // Fall back to keyword-based matching
  const sectionKeywords = extractSimpleKeywords(section.title + ' ' + section.content);

  let bestMatch: VerifiedSource | undefined;
  let bestScore = 0;

  for (const source of verifiedSources) {
    const sourceKeywords = extractSimpleKeywords(source.title + ' ' + source.content);
    const overlap = countOverlap(sectionKeywords, sourceKeywords);
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = source;
    }
  }

  // Only return if there's meaningful overlap (at least 2 keywords)
  return bestScore >= 2 ? bestMatch : undefined;
}

/**
 * Extracts simple keywords from text for matching purposes.
 */
function extractSimpleKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

/**
 * Counts the number of overlapping keywords between two sets.
 */
function countOverlap(setA: Set<string>, setB: Set<string>): number {
  let count = 0;
  for (const word of setA) {
    if (setB.has(word)) count++;
  }
  return count;
}

/**
 * Collects all source attributions from journey sections
 * for the top-level Journey.sources array.
 */
export function collectAttributions(sections: JourneySection[]): SourceAttribution[] {
  const seen = new Set<string>();
  const attributions: SourceAttribution[] = [];

  for (const section of sections) {
    if (section.attribution) {
      const key = `${section.attribution.name}:${section.attribution.url ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        attributions.push(section.attribution);
      }
    }
  }

  return attributions;
}
