// src/lib/document-processor/pdf-parser.ts

import { getDocumentProxy, extractText } from 'unpdf';
import type { DocumentContent, ContentSection, DocumentMetadata } from './index';

export interface PdfParseResult {
  content: DocumentContent;
  metadata: DocumentMetadata;
}

/**
 * Parses a PDF file buffer and extracts text page-by-page using unpdf (PDF.js).
 * This provides much better text extraction for complex layouts like textbooks,
 * multi-column documents, and documents with TOCs/figures.
 */
export async function parsePdf(buffer: Buffer, fileName: string): Promise<PdfParseResult> {
  // Load the PDF document
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  // Extract text from all pages
  const { totalPages, text: fullText } = await extractText(pdf, { mergePages: false });

  // Process page-by-page text into meaningful sections
  const rawText = Array.isArray(fullText) ? fullText.join('\n\n') : String(fullText);
  const pages: string[] = Array.isArray(fullText) ? fullText.map(String) : [String(fullText)];

  // Build sections from pages — group pages into logical sections
  const sections: ContentSection[] = [];
  const headings: string[] = [];
  let sectionOrder = 0;

  // Strategy: each page becomes content, but we detect headings and group accordingly
  let currentSection: { title: string; body: string; level: number } | null = null;

  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i]?.trim();
    if (!pageText || pageText.length < 30) continue; // Skip nearly empty pages

    // Skip pages that are clearly front matter (copyright, TOC-only pages)
    if (isBoilerplatePage(pageText, i)) continue;

    // Try to detect a heading/chapter title from the page
    const detectedHeading = detectPageHeading(pageText);

    if (detectedHeading && detectedHeading !== (currentSection as { title: string; body: string; level: number } | null)?.title) {
      // Save the previous section
      if (currentSection && currentSection.body.trim().length > 50) {
        sections.push({
          title: currentSection.title,
          body: currentSection.body.trim(),
          order: sectionOrder++,
          level: currentSection.level,
        });
        headings.push(currentSection.title);
      }

      // Start a new section
      const bodyWithoutHeading = pageText.replace(detectedHeading, '').trim();
      currentSection = {
        title: detectedHeading,
        body: bodyWithoutHeading,
        level: 1,
      };
    } else if (currentSection) {
      // Append to current section
      currentSection.body += '\n\n' + pageText;
    } else {
      // No section yet — start one with page content
      currentSection = {
        title: `Section ${sectionOrder + 1}`,
        body: pageText,
        level: 1,
      };
    }

    // If a section gets too long, close it and start fresh
    if (currentSection && currentSection.body.length > 8000) {
      sections.push({
        title: currentSection.title,
        body: currentSection.body.trim(),
        order: sectionOrder++,
        level: currentSection.level,
      });
      headings.push(currentSection.title);
      currentSection = null;
    }
  }

  // Push the last section
  if (currentSection && currentSection.body.trim().length > 50) {
    sections.push({
      title: currentSection.title,
      body: currentSection.body.trim(),
      order: sectionOrder++,
      level: currentSection.level,
    });
    headings.push(currentSection.title);
  }

  // If we somehow got no sections, create one from the full text
  if (sections.length === 0 && rawText.trim().length > 0) {
    sections.push({
      title: fileName.replace(/\.pdf$/i, ''),
      body: rawText.slice(0, 10000),
      order: 0,
      level: 1,
    });
  }

  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  const metadata: DocumentMetadata = {
    title: fileName.replace(/\.pdf$/i, ''),
    pageCount: totalPages,
    wordCount,
  };

  return {
    content: {
      sections,
      rawText,
      headings,
      totalCharacters: rawText.length,
    },
    metadata,
  };
}

/**
 * Detects if a page is boilerplate (copyright, TOC listing, figure list, etc.)
 * that should be skipped.
 */
function isBoilerplatePage(pageText: string, pageIndex: number): boolean {
  const lower = pageText.toLowerCase();

  // First few pages are often copyright/front matter
  if (pageIndex < 3) {
    if (lower.includes('copyright') || lower.includes('all rights reserved')) return true;
    if (lower.includes('library of congress') || lower.includes('isbn')) return true;
    if (lower.includes('printed in the united states')) return true;
  }

  // Table of contents pages — lots of dotted lines or page numbers
  const lines = pageText.split('\n');
  const tocLines = lines.filter((l) => /\.{3,}/.test(l) || /\d+\s*$/.test(l.trim()));
  if (tocLines.length > lines.length * 0.6 && lines.length > 5) return true;

  // Pages that are primarily numbered lists of sub-sections (e.g., "4.2.1 Inputs...4.2.2 Tools...")
  const numberedRefs = lines.filter((l) => /^\s*\d+\.\d+\.\d+\s/.test(l));
  if (numberedRefs.length > lines.length * 0.7 && lines.length > 10) return true;

  // Figure/table list pages
  if (lower.startsWith('list of tables') || lower.startsWith('list of figures')) return true;
  const figureLines = lines.filter((l) => /^(figure|table)\s+\d/i.test(l.trim()));
  if (figureLines.length > lines.length * 0.5 && lines.length > 5) return true;

  return false;
}

/**
 * Detects a heading/chapter title from the beginning of a page's text.
 * Looks for patterns like "CHAPTER 5: ...", "5. PROJECT SCOPE MANAGEMENT", etc.
 */
function detectPageHeading(pageText: string): string | null {
  const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  const secondLine = lines[1] || '';

  // Pattern: "CHAPTER X: Title" or "Chapter X Title"
  const chapterMatch = firstLine.match(/^(?:chapter|section|part)\s+\d+[\s:.\-]+(.+)/i);
  if (chapterMatch) return chapterMatch[1].trim() || firstLine;

  // Pattern: "X. TITLE IN CAPS" (numbered chapters)
  const numberedMatch = firstLine.match(/^\d+\.\s+([A-Z][A-Z\s]+)$/);
  if (numberedMatch && firstLine.length < 80) return numberedMatch[1].trim();

  // Pattern: "X.Y Title" where it's a short main heading (not sub-sub-sections)
  const dotNumberedMatch = firstLine.match(/^\d+\.\d+\s+(.{5,60})$/);
  if (dotNumberedMatch && !firstLine.match(/^\d+\.\d+\.\d+/) && lines.length > 3) {
    return dotNumberedMatch[1].trim();
  }

  // Pattern: ALL CAPS line that's short (likely a section heading)
  if (firstLine === firstLine.toUpperCase() && firstLine.length > 5 && firstLine.length < 80 && /[A-Z]/.test(firstLine)) {
    return firstLine;
  }

  // Two-line heading: first line short caps, second line also short
  if (firstLine.length < 50 && secondLine.length < 50 && firstLine === firstLine.toUpperCase() && /[A-Z]/.test(firstLine)) {
    return `${firstLine} ${secondLine}`.trim();
  }

  return null;
}
