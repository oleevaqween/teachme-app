// src/lib/document-processor/epub-parser.ts

import { EPub } from 'epub2';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { DocumentContent, ContentSection, DocumentMetadata } from './index';

export interface EpubParseResult {
  content: DocumentContent;
  metadata: DocumentMetadata;
}

/**
 * Strips HTML tags from a string, returning plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts headings (h1-h5) from HTML content.
 */
function extractHeadingsFromHtml(html: string): string[] {
  const headings: string[] = [];
  const headingRegex = /<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/gi;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const text = stripHtml(match[1]);
    if (text) {
      headings.push(text);
    }
  }
  return headings;
}

/**
 * Parses an EPUB file buffer and extracts text, headings, and sections.
 * Uses epub2 library which requires a file path, so we write to a temp file.
 */
export async function parseEpub(buffer: Buffer, fileName: string): Promise<EpubParseResult> {
  // epub2 requires a file path, so write buffer to a temp file
  const tempDir = await mkdtemp(join(tmpdir(), 'teachme-epub-'));
  const tempFile = join(tempDir, 'temp.epub');

  try {
    await writeFile(tempFile, buffer);

    const epub = await EPub.createAsync(tempFile);

    const headings: string[] = [];
    const sections: ContentSection[] = [];
    let allText = '';
    let sectionOrder = 0;

    // Use the TOC (table of contents) for section structure
    const toc = epub.toc || epub.flow || [];

    for (const tocItem of toc) {
      if (!tocItem.id) continue;

      let chapterHtml = '';
      try {
        chapterHtml = await epub.getChapterAsync(tocItem.id);
      } catch {
        // Skip chapters that fail to load
        continue;
      }

      const chapterText = stripHtml(chapterHtml);
      if (!chapterText) continue;

      const title = tocItem.title || `Chapter ${sectionOrder + 1}`;
      headings.push(title);
      allText += (allText ? '\n' : '') + chapterText;

      // Extract sub-headings from the chapter HTML
      const chapterHeadings = extractHeadingsFromHtml(chapterHtml);
      for (const h of chapterHeadings) {
        if (h !== title && !headings.includes(h)) {
          headings.push(h);
        }
      }

      sections.push({
        title,
        body: chapterText,
        order: sectionOrder++,
        level: tocItem.level ?? 1,
      });
    }

    // If TOC-based parsing yielded nothing, try flow-based parsing
    if (sections.length === 0 && epub.flow) {
      for (const flowItem of epub.flow) {
        if (!flowItem.id) continue;

        let chapterHtml = '';
        try {
          chapterHtml = await epub.getChapterAsync(flowItem.id);
        } catch {
          continue;
        }

        const chapterText = stripHtml(chapterHtml);
        if (!chapterText) continue;

        const title = flowItem.title || `Section ${sectionOrder + 1}`;
        headings.push(title);
        allText += (allText ? '\n' : '') + chapterText;

        sections.push({
          title,
          body: chapterText,
          order: sectionOrder++,
          level: 1,
        });
      }
    }

    // If still no content, create a minimal section
    if (sections.length === 0) {
      sections.push({
        title: fileName,
        body: '',
        order: 0,
        level: 1,
      });
    }

    const wordCount = allText.split(/\s+/).filter(Boolean).length;

    const metadata: DocumentMetadata = {
      title: epub.metadata?.title ?? undefined,
      author: epub.metadata?.creator ?? undefined,
      pageCount: sections.length,
      wordCount,
    };

    return {
      content: {
        sections,
        rawText: allText,
        headings,
        totalCharacters: allText.length,
      },
      metadata,
    };
  } finally {
    // Clean up temp file
    try {
      await unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}
