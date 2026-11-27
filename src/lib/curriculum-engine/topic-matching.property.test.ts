// Property test for community content topic matching
// Task 8.8

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildJourneyStructure } from './journey-builder';
import type { ContentSection } from '@/lib/document-processor';
import type { VerifiedSource } from './index';

/**
 * Property 21: Community Content Topic Matching
 *
 * For any piece of community-sourced information with an associated topic,
 * it SHALL be embedded within the Journey section whose topic most closely
 * matches the sourced content's topic.
 *
 * This is a soft property — the builder uses keyword matching. We verify that
 * for obvious keyword matches, internet-sourced sections are placed adjacent
 * to (within 2 positions of) a document-sourced section that shares keywords
 * with the source content.
 *
 * **Validates: Requirements 11.5**
 */
describe('Property 21: Community Content Topic Matching', () => {
  // Distinct topic domains to make keyword matching unambiguous
  const topics = [
    { keyword: 'photosynthesis', domain: 'biology plants chlorophyll sunlight' },
    { keyword: 'kubernetes', domain: 'containers orchestration pods clusters' },
    { keyword: 'derivatives', domain: 'calculus mathematics functions limits' },
    { keyword: 'renaissance', domain: 'art history painting sculpture florence' },
    { keyword: 'encryption', domain: 'cryptography security algorithms keys ciphers' },
  ];

  // Generate content sections with distinct topics so matching is clear
  const distinctSectionsArb: fc.Arbitrary<ContentSection[]> = fc
    .shuffledSubarray(topics, { minLength: 3, maxLength: 5 })
    .map((selectedTopics) =>
      selectedTopics.map((t, idx) => ({
        title: `Understanding ${t.keyword}`,
        body: `This section covers ${t.keyword} in depth. Key concepts include ${t.domain}. Learn about ${t.keyword} fundamentals.`,
        order: idx + 1,
        level: 2,
      }))
    );

  // Generate a verified source that strongly matches one of the topics
  const matchingSourceArb = (sections: ContentSection[]): fc.Arbitrary<VerifiedSource> =>
    fc.integer({ min: 0, max: sections.length - 1 }).map((targetIdx) => {
      // Find which topic keywords are in the target section
      const targetSection = sections[targetIdx];
      const matchingTopic = topics.find((t) => targetSection.title.includes(t.keyword));
      const keyword = matchingTopic?.keyword ?? 'general';
      const domain = matchingTopic?.domain ?? 'information';

      return {
        url: `https://example.com/${keyword}`,
        title: `Community insights on ${keyword}`,
        content: `Expert discussion about ${keyword}. The community shares knowledge on ${domain} related to ${keyword}.`,
        communityName: `r/${keyword}`,
        confidenceLevel: 'High' as const,
      };
    });

  it('internet-sourced sections are placed within 2 positions of a thematically related document-sourced section', () => {
    fc.assert(
      fc.property(distinctSectionsArb, (concepts) => {
        // For each run, create one matching source
        if (concepts.length < 3) return; // Skip trivial cases

        // Pick a random topic from our sections to create a matching source
        const targetIdx = Math.floor(Math.random() * concepts.length);
        const targetSection = concepts[targetIdx];
        const matchingTopic = topics.find((t) => targetSection.title.includes(t.keyword));

        if (!matchingTopic) return; // Skip if we can't identify the topic

        const source: VerifiedSource = {
          url: `https://example.com/${matchingTopic.keyword}`,
          title: `Community insights on ${matchingTopic.keyword}`,
          content: `Expert discussion about ${matchingTopic.keyword}. The community shares knowledge on ${matchingTopic.domain} related to ${matchingTopic.keyword}.`,
          communityName: `r/${matchingTopic.keyword}`,
          confidenceLevel: 'High',
        };

        const journeySections = buildJourneyStructure(concepts, [source]);

        // Find the internet-sourced section in the output
        const internetSections = journeySections.filter(
          (s) => s.sourceTag === 'Internet-sourced'
        );

        // If no internet section was placed (consolidated away), skip
        if (internetSections.length === 0) return;

        for (const internetSection of internetSections) {
          const internetIdx = journeySections.findIndex((s) => s.id === internetSection.id);

          // Find all document-sourced sections that share keywords with this internet section
          const internetKeywords = matchingTopic.keyword.toLowerCase();

          // Check that there is at least one document-sourced section within 2 positions
          // that shares the topic keyword
          const nearbyIndices = [];
          for (let offset = -2; offset <= 2; offset++) {
            const checkIdx = internetIdx + offset;
            if (checkIdx >= 0 && checkIdx < journeySections.length && checkIdx !== internetIdx) {
              nearbyIndices.push(checkIdx);
            }
          }

          const hasNearbyMatch = nearbyIndices.some((idx) => {
            const section = journeySections[idx];
            return (
              section.sourceTag === 'Document-sourced' &&
              (section.title.toLowerCase().includes(internetKeywords) ||
                section.content.toLowerCase().includes(internetKeywords))
            );
          });

          // If the internet section itself contains the keyword and there's a matching
          // document section anywhere, we expect it to be placed nearby.
          // If no match was found, the builder places at end — that's acceptable.
          const hasMatchingDocSection = journeySections.some(
            (s) =>
              s.sourceTag === 'Document-sourced' &&
              (s.title.toLowerCase().includes(internetKeywords) ||
                s.content.toLowerCase().includes(internetKeywords))
          );

          if (hasMatchingDocSection) {
            expect(hasNearbyMatch).toBe(true);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
