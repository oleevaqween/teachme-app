// src/lib/journey-map-generator/legacy-migration.ts

import type { Stage } from './index';

/**
 * Represents a legacy journey section from the old format (matches Prisma schema).
 */
export interface LegacyJourneySection {
  id: string;
  journeyId: string;
  title: string;
  content: string;
  order: number;
  sourceTag: string; // 'Document-sourced' | 'Internet-sourced'
}

/**
 * Represents a legacy journey from the old format.
 */
export interface LegacyJourney {
  id: string;
  topic: string;
  sections: LegacyJourneySection[];
}

/**
 * Truncates content to the first N words.
 * Returns the truncated string (no trailing ellipsis).
 */
function truncateToWords(content: string, maxWords: number): string {
  const words = content.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= maxWords) {
    return words.join(' ');
  }
  return words.slice(0, maxWords).join(' ');
}

/**
 * Derives a theme string from a sourceTag.
 * Maps known tags to human-friendly theme labels.
 */
function deriveThemeFromSourceTag(sourceTag: string): string {
  switch (sourceTag) {
    case 'Document-sourced':
      return 'Document Exploration';
    case 'Internet-sourced':
      return 'Web Discovery';
    default:
      return 'General Learning';
  }
}

/**
 * Generates a deterministic stage ID from a journey ID and order index.
 * Uses a simple format to avoid external dependencies.
 */
function generateStageId(journeyId: string, order: number): string {
  return `stage-${journeyId}-${order}`;
}

/**
 * Migrates a legacy journey (with JourneySection[]) to the new Stage[] format.
 *
 * Pure function — no database calls, no async operations.
 *
 * Mapping rules:
 * - Sections are sorted by their `order` field
 * - Each section becomes one Stage
 * - title is preserved as-is
 * - summary = first 80 words of content
 * - theme is derived from sourceTag
 * - topicsCovered = [title]
 * - Stages are assigned sequential ordering starting from 1
 *
 * Edge cases:
 * - Empty sections array → returns []
 * - Sections with duplicate orders → sorted stably, still get sequential output
 */
export function migrateLegacyJourney(journey: LegacyJourney): Stage[] {
  if (!journey.sections || journey.sections.length === 0) {
    return [];
  }

  // Sort sections by their original order field
  const sortedSections = [...journey.sections].sort((a, b) => a.order - b.order);

  return sortedSections.map((section, index) => {
    const order = index + 1;
    const summary = truncateToWords(section.content, 80);

    return {
      id: generateStageId(journey.id, order),
      journeyId: journey.id,
      title: section.title,
      summary: summary || section.title, // fallback to title if content is empty
      theme: deriveThemeFromSourceTag(section.sourceTag),
      order,
      topicsCovered: [section.title],
    };
  });
}
