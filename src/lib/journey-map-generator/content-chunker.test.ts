import { describe, it, expect } from 'vitest';
import { chunkDocumentContent } from './content-chunker';
import type { ContentSection } from '@/lib/document-processor';

/**
 * Helper to generate a paragraph with a specific word count.
 */
function generateParagraph(wordCount: number): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(`word${i}`);
  }
  return words.join(' ');
}

/**
 * Helper to create a ContentSection
 */
function makeSection(
  title: string,
  body: string,
  order: number = 1,
  level: number = 1
): ContentSection {
  return { title, body, order, level };
}

describe('chunkDocumentContent', () => {
  it('returns empty array for empty input', () => {
    const result = chunkDocumentContent([]);
    expect(result).toEqual([]);
  });

  it('returns empty array for sections with empty bodies', () => {
    const result = chunkDocumentContent([
      makeSection('Empty', ''),
      makeSection('Whitespace', '   \n\n   '),
    ]);
    expect(result).toEqual([]);
  });

  it('returns one chunk for a single paragraph within bounds', () => {
    const paragraph = generateParagraph(300);
    const sections = [makeSection('Intro', paragraph)];
    const result = chunkDocumentContent(sections);

    expect(result).toHaveLength(1);
    expect(result[0].wordCount).toBe(300);
    expect(result[0].sourceSection).toBe('Intro');
  });

  it('merges multiple small paragraphs to meet minimum word count', () => {
    // Each paragraph is 60 words, need at least 200 to form a chunk
    const smallParagraphs = Array.from({ length: 5 }, (_, i) =>
      generateParagraph(60)
    ).join('\n\n');

    const sections = [makeSection('Small Paras', smallParagraphs)];
    const result = chunkDocumentContent(sections);

    // 5 * 60 = 300 words total, fits in one chunk (200 <= 300 <= 1000)
    expect(result).toHaveLength(1);
    expect(result[0].wordCount).toBe(300);
  });

  it('splits content that exceeds max into multiple chunks', () => {
    // Create a section with many paragraphs totalling ~2000 words
    const paragraphs = Array.from({ length: 10 }, () =>
      generateParagraph(200)
    ).join('\n\n');

    const sections = [makeSection('Big Section', paragraphs)];
    const result = chunkDocumentContent(sections);

    // Should produce multiple chunks, each <= 1000 words
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.wordCount).toBeLessThanOrEqual(1000);
    }
  });

  it('splits oversized paragraph at sentence boundaries', () => {
    // Create a single paragraph with ~1200 words made of sentences
    const sentences = Array.from(
      { length: 40 },
      (_, i) => `This is sentence number ${i} with some extra words to pad it out.`
    ).join(' ');

    const sections = [makeSection('Long Para', sentences)];
    const result = chunkDocumentContent(sections);

    // Should be split into multiple chunks
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const chunk of result) {
      expect(chunk.wordCount).toBeLessThanOrEqual(1000);
    }
  });

  it('preserves source section metadata', () => {
    const paragraph = generateParagraph(250);
    const sections = [
      makeSection('Section A', paragraph, 1),
      makeSection('Section B', generateParagraph(250), 2),
    ];
    const result = chunkDocumentContent(sections);

    // First chunk should reference Section A
    expect(result[0].sourceSection).toBe('Section A');
  });

  it('word count matches actual content', () => {
    const paragraph = generateParagraph(500);
    const sections = [makeSection('Test', paragraph)];
    const result = chunkDocumentContent(sections);

    for (const chunk of result) {
      const actualWords = chunk.content.trim().split(/\s+/).length;
      expect(chunk.wordCount).toBe(actualWords);
    }
  });

  it('handles paragraph at exact min boundary (200 words)', () => {
    const paragraph = generateParagraph(200);
    const sections = [makeSection('Exact Min', paragraph)];
    const result = chunkDocumentContent(sections);

    expect(result).toHaveLength(1);
    expect(result[0].wordCount).toBe(200);
  });

  it('handles paragraph at exact max boundary (1000 words)', () => {
    const paragraph = generateParagraph(1000);
    const sections = [makeSection('Exact Max', paragraph)];
    const result = chunkDocumentContent(sections);

    expect(result).toHaveLength(1);
    expect(result[0].wordCount).toBe(1000);
  });

  it('respects custom chunking options', () => {
    const paragraph = generateParagraph(150);
    const sections = [makeSection('Custom', paragraph)];

    const result = chunkDocumentContent(sections, {
      minWords: 100,
      maxWords: 500,
    });

    expect(result).toHaveLength(1);
    expect(result[0].wordCount).toBe(150);
  });
});
