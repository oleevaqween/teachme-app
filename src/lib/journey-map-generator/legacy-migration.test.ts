import { describe, it, expect } from 'vitest';
import { migrateLegacyJourney, type LegacyJourney } from './legacy-migration';

describe('migrateLegacyJourney', () => {
  it('returns empty array for journey with 0 sections', () => {
    const journey: LegacyJourney = {
      id: 'journey-1',
      topic: 'TypeScript Basics',
      sections: [],
    };

    const result = migrateLegacyJourney(journey);
    expect(result).toEqual([]);
  });

  it('maps a single section to a single stage with order 1', () => {
    const journey: LegacyJourney = {
      id: 'journey-1',
      topic: 'TypeScript Basics',
      sections: [
        {
          id: 'section-1',
          journeyId: 'journey-1',
          title: 'Introduction to Types',
          content: 'TypeScript adds static typing to JavaScript.',
          order: 1,
          sourceTag: 'Document-sourced',
        },
      ],
    };

    const result = migrateLegacyJourney(journey);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Introduction to Types');
    expect(result[0].summary).toBe('TypeScript adds static typing to JavaScript.');
    expect(result[0].order).toBe(1);
    expect(result[0].journeyId).toBe('journey-1');
    expect(result[0].theme).toBe('Document Exploration');
    expect(result[0].topicsCovered).toEqual(['Introduction to Types']);
  });

  it('preserves section order and assigns sequential stage ordering', () => {
    const journey: LegacyJourney = {
      id: 'journey-2',
      topic: 'Node.js',
      sections: [
        {
          id: 'sec-3',
          journeyId: 'journey-2',
          title: 'Third Section',
          content: 'Content three.',
          order: 3,
          sourceTag: 'Internet-sourced',
        },
        {
          id: 'sec-1',
          journeyId: 'journey-2',
          title: 'First Section',
          content: 'Content one.',
          order: 1,
          sourceTag: 'Document-sourced',
        },
        {
          id: 'sec-2',
          journeyId: 'journey-2',
          title: 'Second Section',
          content: 'Content two.',
          order: 2,
          sourceTag: 'Document-sourced',
        },
      ],
    };

    const result = migrateLegacyJourney(journey);

    expect(result).toHaveLength(3);
    // Sorted by original order, new sequential ordering starts from 1
    expect(result[0].title).toBe('First Section');
    expect(result[0].order).toBe(1);
    expect(result[1].title).toBe('Second Section');
    expect(result[1].order).toBe(2);
    expect(result[2].title).toBe('Third Section');
    expect(result[2].order).toBe(3);
  });

  it('truncates content summary to 80 words', () => {
    // Create content with more than 80 words
    const longContent = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');

    const journey: LegacyJourney = {
      id: 'journey-3',
      topic: 'Long Content',
      sections: [
        {
          id: 'sec-1',
          journeyId: 'journey-3',
          title: 'Verbose Section',
          content: longContent,
          order: 1,
          sourceTag: 'Document-sourced',
        },
      ],
    };

    const result = migrateLegacyJourney(journey);
    const summaryWordCount = result[0].summary.split(/\s+/).length;

    expect(summaryWordCount).toBe(80);
  });

  it('derives theme from sourceTag correctly', () => {
    const journey: LegacyJourney = {
      id: 'journey-4',
      topic: 'Mixed Sources',
      sections: [
        {
          id: 'sec-1',
          journeyId: 'journey-4',
          title: 'From Docs',
          content: 'Document content.',
          order: 1,
          sourceTag: 'Document-sourced',
        },
        {
          id: 'sec-2',
          journeyId: 'journey-4',
          title: 'From Web',
          content: 'Web content.',
          order: 2,
          sourceTag: 'Internet-sourced',
        },
        {
          id: 'sec-3',
          journeyId: 'journey-4',
          title: 'Unknown Source',
          content: 'Other content.',
          order: 3,
          sourceTag: 'Custom-tag',
        },
      ],
    };

    const result = migrateLegacyJourney(journey);

    expect(result[0].theme).toBe('Document Exploration');
    expect(result[1].theme).toBe('Web Discovery');
    expect(result[2].theme).toBe('General Learning');
  });

  it('handles journey with many sections', () => {
    const sections = Array.from({ length: 50 }, (_, i) => ({
      id: `sec-${i}`,
      journeyId: 'journey-5',
      title: `Section ${i + 1}`,
      content: `Content for section ${i + 1} with enough words to be meaningful.`,
      order: i + 1,
      sourceTag: 'Document-sourced',
    }));

    const journey: LegacyJourney = {
      id: 'journey-5',
      topic: 'Large Journey',
      sections,
    };

    const result = migrateLegacyJourney(journey);

    expect(result).toHaveLength(50);
    // Verify sequential ordering
    result.forEach((stage, index) => {
      expect(stage.order).toBe(index + 1);
    });
    // All stages have non-empty title and summary
    result.forEach((stage) => {
      expect(stage.title.length).toBeGreaterThan(0);
      expect(stage.summary.length).toBeGreaterThan(0);
    });
  });

  it('uses title as summary fallback when content is empty', () => {
    const journey: LegacyJourney = {
      id: 'journey-6',
      topic: 'Empty Content',
      sections: [
        {
          id: 'sec-1',
          journeyId: 'journey-6',
          title: 'Section With No Content',
          content: '',
          order: 1,
          sourceTag: 'Document-sourced',
        },
      ],
    };

    const result = migrateLegacyJourney(journey);

    expect(result[0].summary).toBe('Section With No Content');
  });

  it('generates unique IDs for each stage', () => {
    const journey: LegacyJourney = {
      id: 'journey-7',
      topic: 'ID Test',
      sections: [
        {
          id: 'sec-1',
          journeyId: 'journey-7',
          title: 'First',
          content: 'Content 1.',
          order: 1,
          sourceTag: 'Document-sourced',
        },
        {
          id: 'sec-2',
          journeyId: 'journey-7',
          title: 'Second',
          content: 'Content 2.',
          order: 2,
          sourceTag: 'Document-sourced',
        },
      ],
    };

    const result = migrateLegacyJourney(journey);
    const ids = result.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});
