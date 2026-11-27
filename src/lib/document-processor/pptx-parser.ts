// src/lib/document-processor/pptx-parser.ts

import { parseOffice } from 'officeparser';
import type { DocumentContent, ContentSection, DocumentMetadata } from './index';

export interface PptxParseResult {
  content: DocumentContent;
  metadata: DocumentMetadata;
}

/**
 * Parses a PPTX file buffer and extracts text and slide-based sections.
 * Uses officeparser for PowerPoint presentation parsing.
 */
export async function parsePptx(buffer: Buffer, fileName: string): Promise<PptxParseResult> {
  const ast = await parseOffice(buffer, { fileType: 'pptx' });

  const rawText = ast.toText();
  const headings: string[] = [];
  const sections: ContentSection[] = [];
  let sectionOrder = 0;

  // PPTX content is organized by slides
  for (const node of ast.content) {
    if (node.type === 'slide') {
      const slideNumber = (node.metadata?.slideNumber ?? sectionOrder + 1);
      // Slides don't have a title in metadata; extract from first heading child or use slide number
      let slideTitle = `Slide ${slideNumber}`;
      if (node.children) {
        const headingChild = node.children.find(
          (c) => c.type === 'heading' && c.text
        );
        if (headingChild?.text) {
          slideTitle = headingChild.text;
        }
      }
      headings.push(slideTitle);

      // Collect all text from the slide's children
      let slideText = '';
      if (node.children) {
        for (const child of node.children) {
          if (child.text) {
            slideText += (slideText ? '\n' : '') + child.text;
          }
        }
      }

      // Fall back to node.text if children didn't yield content
      if (!slideText && node.text) {
        slideText = node.text;
      }

      sections.push({
        title: slideTitle,
        body: slideText,
        order: sectionOrder++,
        level: 1,
      });
    }
  }

  // If no slide nodes found, create a single section from rawText
  if (sections.length === 0 && rawText.trim()) {
    sections.push({
      title: fileName,
      body: rawText,
      order: 0,
      level: 1,
    });
  }

  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  const metadata: DocumentMetadata = {
    title: ast.metadata.title ?? undefined,
    author: ast.metadata.author ?? undefined,
    pageCount: ast.metadata.pages ?? sections.length,
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
