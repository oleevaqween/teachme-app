// src/lib/journey-map-generator/content-chunker.ts

import type { ContentSection } from '@/lib/document-processor';

/**
 * Extended ContentSection that may include source document metadata.
 * Compatible with both plain ContentSection and PooledContentSection.
 */
export interface ChunkableSection extends ContentSection {
  sourceDocument?: string;
}

export interface ChunkingOptions {
  minWords: number; // default: 200
  maxWords: number; // default: 1000
  overlapWords: number; // default: 50 (for context continuity)
}

export interface RawChunk {
  content: string;
  wordCount: number;
  sourceSection: string;
  sourceDocument: string;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  minWords: 200,
  maxWords: 1000,
  overlapWords: 50,
};

/**
 * Counts the number of words in a string.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Splits a paragraph into sentences using common sentence-ending punctuation.
 * Handles abbreviations and decimals reasonably.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end of string
  const sentences = text.match(/[^.!?]*[.!?]+[\s]?|[^.!?]+$/g);
  if (!sentences) return [text];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Splits a single paragraph that exceeds maxWords into sub-chunks at sentence boundaries.
 * Each sub-chunk will have at most maxWords words. If a single sentence exceeds maxWords,
 * it becomes its own chunk regardless of size.
 */
function splitParagraphAtSentences(
  paragraph: string,
  maxWords: number
): string[] {
  const sentences = splitIntoSentences(paragraph);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = countWords(sentence);

    // If adding this sentence would exceed max, finalize current chunk
    if (currentWordCount > 0 && currentWordCount + sentenceWordCount > maxWords) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
      currentWordCount = 0;
    }

    currentChunk.push(sentence);
    currentWordCount += sentenceWordCount;

    // If a single sentence exceeds maxWords, it becomes its own chunk
    if (currentChunk.length === 1 && currentWordCount > maxWords) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
      currentWordCount = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

/**
 * Splits document content into chunks preserving paragraph boundaries.
 * Pure function suitable for property-based testing.
 *
 * Accepts either plain ContentSection[] or ChunkableSection[] (with sourceDocument metadata).
 * When sourceDocument is present on sections, it flows through to chunks for traceability.
 *
 * Algorithm:
 * 1. Extract paragraphs from all sections (split on double newline)
 * 2. For paragraphs exceeding maxWords, split at sentence boundaries
 * 3. Merge consecutive small paragraphs to meet minWords threshold
 * 4. Each chunk records its source section and document metadata
 */
export function chunkDocumentContent(
  sections: ChunkableSection[],
  options?: Partial<ChunkingOptions>
): RawChunk[] {
  const opts: ChunkingOptions = { ...DEFAULT_OPTIONS, ...options };

  if (sections.length === 0) {
    return [];
  }

  // Step 1: Extract paragraphs from all sections, preserving source metadata
  interface ParagraphEntry {
    text: string;
    sourceSection: string;
    sourceDocument: string;
  }

  const paragraphs: ParagraphEntry[] = [];

  for (const section of sections) {
    const body = section.body.trim();
    if (body.length === 0) continue;

    // Split on double newlines to get paragraphs
    const rawParagraphs = body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0);

    for (const para of rawParagraphs) {
      paragraphs.push({
        text: para,
        sourceSection: section.title,
        // Use sourceDocument from section if available (PooledContentSection),
        // otherwise default to empty string for plain ContentSection input.
        sourceDocument: (section as ChunkableSection).sourceDocument || '',
      });
    }
  }

  if (paragraphs.length === 0) {
    return [];
  }

  // Step 2: Handle oversized paragraphs by splitting at sentence boundaries
  interface TextFragment {
    text: string;
    sourceSection: string;
    sourceDocument: string;
  }

  const fragments: TextFragment[] = [];

  for (const para of paragraphs) {
    const wordCount = countWords(para.text);

    if (wordCount > opts.maxWords) {
      // Split oversized paragraph at sentence boundaries
      const subChunks = splitParagraphAtSentences(para.text, opts.maxWords);
      for (const sub of subChunks) {
        fragments.push({
          text: sub,
          sourceSection: para.sourceSection,
          sourceDocument: para.sourceDocument,
        });
      }
    } else {
      fragments.push({
        text: para.text,
        sourceSection: para.sourceSection,
        sourceDocument: para.sourceDocument,
      });
    }
  }

  // Step 3: Merge consecutive small fragments to meet minimum word count
  const chunks: RawChunk[] = [];
  let accumText: string[] = [];
  let accumWordCount = 0;
  let accumSourceSection = fragments[0].sourceSection;
  let accumSourceDocument = fragments[0].sourceDocument;

  for (let i = 0; i < fragments.length; i++) {
    const fragment = fragments[i];
    const fragmentWordCount = countWords(fragment.text);

    // If accumulator is empty, start a new chunk
    if (accumText.length === 0) {
      accumText.push(fragment.text);
      accumWordCount = fragmentWordCount;
      accumSourceSection = fragment.sourceSection;
      accumSourceDocument = fragment.sourceDocument;
      continue;
    }

    // Check if adding this fragment would exceed maxWords
    if (accumWordCount + fragmentWordCount > opts.maxWords) {
      // Finalize current accumulator as a chunk (even if below min)
      // unless it's empty
      if (accumWordCount > 0) {
        chunks.push({
          content: accumText.join('\n\n'),
          wordCount: accumWordCount,
          sourceSection: accumSourceSection,
          sourceDocument: accumSourceDocument,
        });
      }
      // Start new accumulator with current fragment
      accumText = [fragment.text];
      accumWordCount = fragmentWordCount;
      accumSourceSection = fragment.sourceSection;
      accumSourceDocument = fragment.sourceDocument;
    } else {
      // Merge fragment into accumulator
      accumText.push(fragment.text);
      accumWordCount += fragmentWordCount;
    }

    // If we've reached or exceeded minWords, finalize the chunk
    // unless the next fragment would still fit and we haven't hit max
    if (accumWordCount >= opts.minWords) {
      // Look ahead: if next fragment exists and would keep us under max,
      // we could continue merging. But since we've met the minimum,
      // finalize here to keep chunks balanced.
      const nextFragment = fragments[i + 1];
      const nextWordCount = nextFragment ? countWords(nextFragment.text) : 0;

      // Finalize if adding next would exceed max, or we're at a good size,
      // or there's no next fragment
      if (
        !nextFragment ||
        accumWordCount + nextWordCount > opts.maxWords
      ) {
        chunks.push({
          content: accumText.join('\n\n'),
          wordCount: accumWordCount,
          sourceSection: accumSourceSection,
          sourceDocument: accumSourceDocument,
        });
        accumText = [];
        accumWordCount = 0;
        accumSourceSection = '';
        accumSourceDocument = '';
      }
    }
  }

  // Handle remaining content in accumulator
  if (accumText.length > 0 && accumWordCount > 0) {
    // If the remaining chunk is too small and there's a previous chunk,
    // merge with the last chunk if it won't exceed max
    if (
      accumWordCount < opts.minWords &&
      chunks.length > 0 &&
      chunks[chunks.length - 1].wordCount + accumWordCount <= opts.maxWords
    ) {
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.content += '\n\n' + accumText.join('\n\n');
      lastChunk.wordCount += accumWordCount;
    } else {
      // Create a final chunk even if it's below minimum (unavoidable for small content)
      chunks.push({
        content: accumText.join('\n\n'),
        wordCount: accumWordCount,
        sourceSection: accumSourceSection,
        sourceDocument: accumSourceDocument,
      });
    }
  }

  return chunks;
}
