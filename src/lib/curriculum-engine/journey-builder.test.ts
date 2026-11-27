import { describe, it, expect } from 'vitest';
import { buildJourneyStructure } from './journey-builder';
import type { ContentSection } from '@/lib/document-processor';
import type { VerifiedSource } from './index';

function makeSection(title: string, body: string, order: number, level = 1): ContentSection {
  return { title, body, order, level };
}

function makeSource(title: string, content: string, community: string, confidence: 'High' | 'Medium' | 'Low' = 'High'): VerifiedSource {
  return {
    url: `https://example.com/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    content,
    communityName: community,
    confidenceLevel: confidence,
  };
}

describe('buildJourneyStructure', () => {
  it('should return sections with order between 5 and 50 when given sufficient concepts', () => {
    const concepts: ContentSection[] = Array.from({ length: 10 }, (_, i) =>
      makeSection(`Section ${i + 1}`, `Body content for section ${i + 1} with enough detail`, i + 1)
    );
    const sources: VerifiedSource[] = [];

    const result = buildJourneyStructure(concepts, sources);

    expect(result.length).toBeGreaterThanOrEqual(5);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('should expand sections to meet minimum of 5 when fewer concepts given', () => {
    const concepts: ContentSection[] = [
      makeSection('Introduction', 'This is a detailed introduction paragraph.\n\nWith multiple paragraphs of content to allow splitting.', 1),
      makeSection('Conclusion', 'This is the conclusion paragraph.\n\nWith a final summary and some more text.', 2),
    ];
    const sources: VerifiedSource[] = [];

    const result = buildJourneyStructure(concepts, sources);

    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('should consolidate sections when total exceeds 50', () => {
    const concepts: ContentSection[] = Array.from({ length: 55 }, (_, i) =>
      makeSection(`Topic ${i + 1}`, `Content for topic ${i + 1}`, i + 1)
    );
    const sources: VerifiedSource[] = [];

    const result = buildJourneyStructure(concepts, sources);

    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('should produce ordering that differs from original document TOC order', () => {
    const concepts: ContentSection[] = [
      makeSection('Chapter 1: Basics', 'Basic programming concepts and fundamentals', 1),
      makeSection('Chapter 2: Variables', 'Variables and data types explained', 2),
      makeSection('Chapter 3: Functions', 'Functions and methods in programming', 3),
      makeSection('Chapter 4: Classes', 'Object oriented programming with classes', 4),
      makeSection('Chapter 5: Advanced', 'Advanced topics and design patterns', 5),
    ];
    const sources: VerifiedSource[] = [];

    const result = buildJourneyStructure(concepts, sources);

    // Extract document-sourced section titles (removing suffixes like " (Part 1)")
    const resultTitles = result
      .filter(s => s.sourceTag === 'Document-sourced')
      .map(s => s.title.replace(/ \(Part [12]\)$/, '').replace(/^Overview: /, ''));

    const originalTitles = concepts.map(c => c.title);

    // Verify the ordering is not the same as original
    const isSameOrder = resultTitles.length === originalTitles.length &&
      resultTitles.every((t, i) => t === originalTitles[i]);

    expect(isSameOrder).toBe(false);
  });

  it('should tag document-sourced sections correctly', () => {
    const concepts: ContentSection[] = Array.from({ length: 7 }, (_, i) =>
      makeSection(`Topic ${i + 1}`, `Content for topic ${i + 1}`, i + 1)
    );
    const sources: VerifiedSource[] = [];

    const result = buildJourneyStructure(concepts, sources);

    const docSections = result.filter(s => s.sourceTag === 'Document-sourced');
    expect(docSections.length).toBeGreaterThan(0);
    docSections.forEach(s => {
      expect(s.sourceTag).toBe('Document-sourced');
    });
  });

  it('should tag internet-sourced sections with attribution and confidence level', () => {
    const concepts: ContentSection[] = Array.from({ length: 7 }, (_, i) =>
      makeSection(`Topic ${i + 1}`, `Content for topic ${i + 1}`, i + 1)
    );
    const sources: VerifiedSource[] = [
      makeSource('Community Tip', 'A tip from the community about programming', 'r/programming', 'High'),
    ];

    const result = buildJourneyStructure(concepts, sources);

    const internetSections = result.filter(s => s.sourceTag === 'Internet-sourced');
    expect(internetSections.length).toBe(1);
    internetSections.forEach(s => {
      expect(s.sourceTag).toBe('Internet-sourced');
      expect(s.attribution).toBeDefined();
      expect(s.attribution!.name).toBeTruthy();
      expect(s.confidenceLevel).toMatch(/^(High|Medium|Low)$/);
    });
  });

  it('should assign sequential order numbers to all sections', () => {
    const concepts: ContentSection[] = Array.from({ length: 8 }, (_, i) =>
      makeSection(`Topic ${i + 1}`, `Content for topic ${i + 1}`, i + 1)
    );
    const sources: VerifiedSource[] = [
      makeSource('Extra Info', 'Community sourced information', 'r/learnprogramming', 'Medium'),
    ];

    const result = buildJourneyStructure(concepts, sources);

    result.forEach((section, idx) => {
      expect(section.order).toBe(idx + 1);
    });
  });

  it('should populate relatedSections for sections with conceptual overlap', () => {
    const concepts: ContentSection[] = [
      makeSection('JavaScript Variables', 'JavaScript variables let const var declarations', 1),
      makeSection('JavaScript Functions', 'JavaScript functions arrow functions callbacks', 2),
      makeSection('Python Variables', 'Python variables assignment types', 3),
      makeSection('Python Functions', 'Python functions def lambda', 4),
      makeSection('Database Design', 'SQL tables relationships normalization', 5),
      makeSection('Database Queries', 'SQL queries joins subqueries', 6),
      makeSection('Network Protocols', 'HTTP TCP UDP network communication', 7),
    ];
    const sources: VerifiedSource[] = [];

    const result = buildJourneyStructure(concepts, sources);

    // At least some sections should have related sections
    const sectionsWithRelated = result.filter(s => s.relatedSections.length > 0);
    expect(sectionsWithRelated.length).toBeGreaterThan(0);
  });

  it('should generate unique IDs for all sections', () => {
    const concepts: ContentSection[] = Array.from({ length: 10 }, (_, i) =>
      makeSection(`Section ${i + 1}`, `Body content for section ${i + 1}`, i + 1)
    );
    const sources: VerifiedSource[] = [
      makeSource('Tip 1', 'A community tip', 'r/programming', 'High'),
      makeSource('Tip 2', 'Another tip', 'r/learnprogramming', 'Medium'),
    ];

    const result = buildJourneyStructure(concepts, sources);

    const ids = result.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should handle empty concepts with only community sources', () => {
    const concepts: ContentSection[] = [];
    const sources: VerifiedSource[] = Array.from({ length: 3 }, (_, i) =>
      makeSource(`Source ${i + 1}`, `Community content ${i + 1} with enough text.\n\nMore paragraph content here.`, `community-${i + 1}`, 'High')
    );

    const result = buildJourneyStructure(concepts, sources);

    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('should handle empty inputs gracefully', () => {
    const result = buildJourneyStructure([], []);

    expect(result.length).toBeGreaterThanOrEqual(5);
  });
});
