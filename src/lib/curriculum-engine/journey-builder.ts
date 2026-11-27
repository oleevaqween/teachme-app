// src/lib/curriculum-engine/journey-builder.ts

import { randomUUID } from 'crypto';
import type { ContentSection } from '@/lib/document-processor';
import type { JourneySection, SourceAttribution, VerifiedSource } from './index';

const MIN_SECTIONS = 5;
const MAX_SECTIONS = 50;

/**
 * Extracts keywords from a title or body text for similarity comparison.
 * Splits on whitespace and common delimiters, lowercases, and filters short/stop words.
 */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'as', 'not', 'no', 'so', 'if', 'then',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return new Set(words);
}

/**
 * Computes Jaccard similarity between two keyword sets.
 * Returns a value between 0 (no overlap) and 1 (identical sets).
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  Array.from(setA).forEach(word => {
    if (setB.has(word)) intersection++;
  });

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Groups content sections by thematic similarity using keyword overlap.
 * Returns an array of groups, each containing indices into the original array.
 */
function groupByTheme(sections: ContentSection[]): number[][] {
  if (sections.length === 0) return [];
  if (sections.length === 1) return [[0]];

  const keywords = sections.map(s => extractKeywords(`${s.title} ${s.body}`));
  const assigned = new Set<number>();
  const groups: number[][] = [];
  const SIMILARITY_THRESHOLD = 0.15;

  for (let i = 0; i < sections.length; i++) {
    if (assigned.has(i)) continue;

    const group: number[] = [i];
    assigned.add(i);

    for (let j = i + 1; j < sections.length; j++) {
      if (assigned.has(j)) continue;

      const similarity = jaccardSimilarity(keywords[i], keywords[j]);
      if (similarity >= SIMILARITY_THRESHOLD) {
        group.push(j);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Reorders groups to create a non-linear learning path.
 * Strategy: Start with overview/intro groups (shorter sections), then alternate
 * between thematic deep-dives, placing larger groups in the middle.
 */
function reorderGroups(groups: number[][], sections: ContentSection[]): number[][] {
  if (groups.length <= 1) return groups;

  // Sort groups by average section level (lower level = higher-level concept)
  const groupsWithMeta = groups.map((group, idx) => {
    const avgLevel = group.reduce((sum, i) => sum + sections[i].level, 0) / group.length;
    const avgLength = group.reduce((sum, i) => sum + sections[i].body.length, 0) / group.length;
    return { group, idx, avgLevel, avgLength, size: group.length };
  });

  // Separate into intro (high-level, short) and deep-dive (detailed, longer) groups
  const introGroups = groupsWithMeta.filter(g => g.avgLevel <= 2 || g.size === 1);
  const deepDiveGroups = groupsWithMeta.filter(g => g.avgLevel > 2 && g.size > 1);

  // Interleave: start with hook (smallest intro), then alternate deep-dives with intros
  const reordered: number[][] = [];

  // Start with the smallest intro group as a "hook"
  if (introGroups.length > 0) {
    introGroups.sort((a, b) => a.size - b.size);
    reordered.push(introGroups[0].group);
    introGroups.shift();
  }

  // Sort deep-dives by size (larger in the middle for engagement curve)
  deepDiveGroups.sort((a, b) => b.size - a.size);

  // Interleave remaining: deep-dive then intro
  let dIdx = 0;
  let iIdx = 0;
  while (dIdx < deepDiveGroups.length || iIdx < introGroups.length) {
    if (dIdx < deepDiveGroups.length) {
      reordered.push(deepDiveGroups[dIdx].group);
      dIdx++;
    }
    if (iIdx < introGroups.length) {
      reordered.push(introGroups[iIdx].group);
      iIdx++;
    }
  }

  return reordered;
}

/**
 * Within each group, reverse the section order so the most detailed content
 * comes first (bottom-up exploration within a theme).
 */
function reorderWithinGroup(group: number[], sections: ContentSection[]): number[] {
  if (group.length <= 1) return group;

  // Sort by level descending (deeper concepts first within theme), then by body length
  return [...group].sort((a, b) => {
    const levelDiff = sections[b].level - sections[a].level;
    if (levelDiff !== 0) return levelDiff;
    return sections[b].body.length - sections[a].body.length;
  });
}

/**
 * Creates internet-sourced journey sections from verified community sources.
 */
function createInternetSections(sources: VerifiedSource[]): JourneySection[] {
  return sources.map(source => ({
    id: randomUUID(),
    title: source.title,
    content: source.content,
    order: 0, // Will be assigned later
    sourceTag: 'Internet-sourced' as const,
    confidenceLevel: source.confidenceLevel,
    relatedSections: [],
    attribution: {
      name: source.communityName,
      url: source.url,
      type: 'community' as const,
    },
  }));
}

/**
 * Creates document-sourced journey sections from content sections.
 */
function createDocumentSections(sections: ContentSection[], indices: number[]): JourneySection[] {
  return indices.map(idx => ({
    id: randomUUID(),
    title: sections[idx].title,
    content: sections[idx].body,
    order: 0, // Will be assigned later
    sourceTag: 'Document-sourced' as const,
    relatedSections: [],
  }));
}

/**
 * Links related sections by finding pairs with keyword overlap.
 * Sets the relatedSections field on each section.
 */
function linkRelatedSections(sections: JourneySection[]): void {
  const LINK_THRESHOLD = 0.1;
  const keywords = sections.map(s => extractKeywords(`${s.title} ${s.content}`));

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const similarity = jaccardSimilarity(keywords[i], keywords[j]);
      if (similarity >= LINK_THRESHOLD) {
        sections[i].relatedSections.push(sections[j].id);
        sections[j].relatedSections.push(sections[i].id);
      }
    }
  }
}

/**
 * Merges sections to bring count within the maximum bound.
 * Combines the most similar adjacent sections until count ≤ MAX_SECTIONS.
 */
function consolidateSections(sections: JourneySection[]): JourneySection[] {
  let result = [...sections];

  while (result.length > MAX_SECTIONS) {
    // Find the most similar adjacent pair and merge them
    let bestIdx = 0;
    let bestSimilarity = -1;

    for (let i = 0; i < result.length - 1; i++) {
      const kwA = extractKeywords(`${result[i].title} ${result[i].content}`);
      const kwB = extractKeywords(`${result[i + 1].title} ${result[i + 1].content}`);
      const similarity = jaccardSimilarity(kwA, kwB);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIdx = i;
      }
    }

    // Merge sections at bestIdx and bestIdx+1
    const merged: JourneySection = {
      id: result[bestIdx].id,
      title: `${result[bestIdx].title} & ${result[bestIdx + 1].title}`,
      content: `${result[bestIdx].content}\n\n${result[bestIdx + 1].content}`,
      order: 0,
      sourceTag: result[bestIdx].sourceTag,
      confidenceLevel: result[bestIdx].confidenceLevel ?? result[bestIdx + 1].confidenceLevel,
      relatedSections: [
        ...result[bestIdx].relatedSections,
        ...result[bestIdx + 1].relatedSections,
      ].filter(id => id !== result[bestIdx].id && id !== result[bestIdx + 1].id),
      attribution: result[bestIdx].attribution ?? result[bestIdx + 1].attribution,
    };

    result = [...result.slice(0, bestIdx), merged, ...result.slice(bestIdx + 2)];
  }

  return result;
}

/**
 * Expands sections to meet the minimum bound by splitting larger sections.
 * Splits the longest sections until count >= MIN_SECTIONS.
 */
function expandSections(sections: JourneySection[]): JourneySection[] {
  const result = [...sections];

  while (result.length < MIN_SECTIONS) {
    // If we have no sections at all, generate placeholder sections
    if (result.length === 0) {
      result.push({
        id: randomUUID(),
        title: `Section ${result.length + 1}`,
        content: 'Content placeholder for this section.',
        order: 0,
        sourceTag: 'Document-sourced',
        relatedSections: [],
      });
      continue;
    }

    // Find the longest section by content length
    let longestIdx = 0;
    let longestLen = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i].content.length > longestLen) {
        longestLen = result[i].content.length;
        longestIdx = i;
      }
    }

    const section = result[longestIdx];
    const paragraphs = section.content.split(/\n\n+/);

    if (paragraphs.length >= 2) {
      // Split at midpoint of paragraphs
      const mid = Math.ceil(paragraphs.length / 2);
      const firstHalf: JourneySection = {
        ...section,
        id: section.id,
        title: `${section.title} (Part 1)`,
        content: paragraphs.slice(0, mid).join('\n\n'),
        relatedSections: [...section.relatedSections],
      };
      const secondHalf: JourneySection = {
        ...section,
        id: randomUUID(),
        title: `${section.title} (Part 2)`,
        content: paragraphs.slice(mid).join('\n\n'),
        relatedSections: [...section.relatedSections, section.id],
      };
      firstHalf.relatedSections.push(secondHalf.id);

      result.splice(longestIdx, 1, firstHalf, secondHalf);
    } else {
      // Can't split further; generate a placeholder overview section
      const overviewSection: JourneySection = {
        id: randomUUID(),
        title: `Overview: ${section.title}`,
        content: `Introduction and key concepts for: ${section.title}`,
        order: 0,
        sourceTag: section.sourceTag,
        confidenceLevel: section.confidenceLevel,
        relatedSections: [section.id],
        attribution: section.attribution,
      };
      section.relatedSections.push(overviewSection.id);
      result.splice(longestIdx, 0, overviewSection);
    }
  }

  return result;
}

/**
 * Ensures the final section ordering differs from the original document TOC order.
 * If the ordering happens to match (unlikely but possible), applies a rotation.
 */
function ensureNonLinearOrder(
  finalSections: JourneySection[],
  originalOrder: ContentSection[]
): JourneySection[] {
  if (finalSections.length <= 1 || originalOrder.length <= 1) {
    return finalSections;
  }

  // Check if the document-sourced sections follow the same order as original
  const docSectionTitles = finalSections
    .filter(s => s.sourceTag === 'Document-sourced')
    .map(s => s.title.replace(/ \(Part [12]\)$/, '').replace(/^Overview: /, ''));

  const originalTitles = originalOrder.map(s => s.title);

  // Check if it's a subsequence match (same relative order)
  let matchesOriginal = true;
  let origIdx = 0;
  for (const title of docSectionTitles) {
    const foundIdx = originalTitles.indexOf(title, origIdx);
    if (foundIdx === -1) {
      matchesOriginal = false;
      break;
    }
    if (foundIdx < origIdx) {
      matchesOriginal = false;
      break;
    }
    origIdx = foundIdx + 1;
  }

  if (matchesOriginal && docSectionTitles.length >= 2) {
    // Rotate: move first section to after the second section
    const [first, ...rest] = finalSections;
    if (rest.length >= 1) {
      return [rest[0], first, ...rest.slice(1)];
    }
  }

  return finalSections;
}

/**
 * Builds a creative, non-linear journey structure from document sections and community sources.
 *
 * Strategy:
 * 1. Group document sections by thematic similarity (keyword overlap)
 * 2. Reorder groups to create an engagement curve (hook → deep-dives → synthesis)
 * 3. Within each group, reorder sections bottom-up (detail-first)
 * 4. Interleave internet-sourced sections near matching document themes
 * 5. Ensure section count is within [5, 50] bounds
 * 6. Link related sections via the relatedSections field
 * 7. Verify ordering differs from original document TOC
 *
 * This is a pure/deterministic function with no LLM calls.
 */
export function buildJourneyStructure(
  concepts: ContentSection[],
  communitySources: VerifiedSource[]
): JourneySection[] {
  // Step 1: Group document sections by theme
  const groups = groupByTheme(concepts);

  // Step 2: Reorder groups for non-linear engagement
  const reorderedGroups = reorderGroups(groups, concepts);

  // Step 3: Within each group, reorder for bottom-up exploration
  const reorderedIndices: number[] = [];
  for (const group of reorderedGroups) {
    const reorderedGroup = reorderWithinGroup(group, concepts);
    reorderedIndices.push(...reorderedGroup);
  }

  // Step 4: Create document-sourced sections in new order
  const documentSections = createDocumentSections(concepts, reorderedIndices);

  // Step 5: Create internet-sourced sections from verified community sources
  const internetSections = createInternetSections(communitySources);

  // Step 6: Interleave internet sections near thematically matching document sections
  let allSections = interleaveSections(documentSections, internetSections);

  // Step 7: Enforce section count bounds
  if (allSections.length > MAX_SECTIONS) {
    allSections = consolidateSections(allSections);
  }
  if (allSections.length < MIN_SECTIONS) {
    allSections = expandSections(allSections);
  }

  // Step 8: Assign sequential order numbers
  allSections.forEach((section, idx) => {
    section.order = idx + 1;
  });

  // Step 9: Link related sections by conceptual overlap
  linkRelatedSections(allSections);

  // Step 10: Final check that ordering differs from original TOC
  allSections = ensureNonLinearOrder(allSections, concepts);

  // Re-assign order after potential reordering
  allSections.forEach((section, idx) => {
    section.order = idx + 1;
  });

  return allSections;
}

/**
 * Interleaves internet-sourced sections into the document-sourced sections
 * at positions where their content best matches the surrounding theme.
 */
function interleaveSections(
  documentSections: JourneySection[],
  internetSections: JourneySection[]
): JourneySection[] {
  if (internetSections.length === 0) return documentSections;
  if (documentSections.length === 0) return internetSections;

  const result = [...documentSections];
  const docKeywords = result.map(s => extractKeywords(`${s.title} ${s.content}`));

  for (const internetSection of internetSections) {
    const iKeywords = extractKeywords(`${internetSection.title} ${internetSection.content}`);

    // Find the best matching document section position
    let bestIdx = 0;
    let bestSimilarity = -1;

    for (let i = 0; i < result.length; i++) {
      const similarity = jaccardSimilarity(iKeywords, docKeywords[i] ?? new Set());
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIdx = i;
      }
    }

    // Insert after the best match
    const insertPos = Math.min(bestIdx + 1, result.length);
    result.splice(insertPos, 0, internetSection);
    // Update keyword cache for newly inserted item
    docKeywords.splice(insertPos, 0, iKeywords);
  }

  return result;
}
