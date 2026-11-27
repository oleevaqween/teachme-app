// src/lib/document-processor/docx-parser.ts

import { parseOffice } from 'officeparser';
import type { DocumentContent, ContentSection, DocumentMetadata } from './index';

export interface DocxParseResult {
  content: DocumentContent;
  metadata: DocumentMetadata;
}

/**
 * Parses a DOCX file buffer and extracts text, headings, and sections.
 * Uses officeparser for DOCX (Office Open XML) parsing.
 */
export async function parseDocx(buffer: Buffer, fileName: string): Promise<DocxParseResult> {
  const ast = await parseOffice(buffer, { fileType: 'docx' });

  const rawText = ast.toText();
  const headings: string[] = [];
  const sections: ContentSection[] = [];
  let sectionOrder = 0;

  let currentSection: ContentSection | null = null;

  // Walk through AST content nodes to extract headings and build sections
  for (const node of ast.content) {
    if (node.type === 'heading' && node.text) {
      // Save previous section if exists
      if (currentSection) {
        sections.push(currentSection);
      }
      const level = node.metadata?.level ?? 1;
      headings.push(node.text);
      currentSection = {
        title: node.text,
        body: '',
        order: sectionOrder++,
        level,
      };
    } else if (node.type === 'paragraph' && node.text) {
      if (currentSection) {
        currentSection.body += (currentSection.body ? '\n' : '') + node.text;
      } else {
        // Text before any heading — create a default section
        currentSection = {
          title: fileName,
          body: node.text,
          order: sectionOrder++,
          level: 1,
        };
      }
    } else if (node.type === 'table' && node.text) {
      // Tables — append text to current section or create new one
      if (currentSection) {
        currentSection.body += (currentSection.body ? '\n' : '') + node.text;
      } else {
        currentSection = {
          title: fileName,
          body: node.text,
          order: sectionOrder++,
          level: 1,
        };
      }
    } else if (node.type === 'list' && node.text) {
      if (currentSection) {
        currentSection.body += (currentSection.body ? '\n' : '') + node.text;
      } else {
        currentSection = {
          title: fileName,
          body: node.text,
          order: sectionOrder++,
          level: 1,
        };
      }
    }
  }

  // Push the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  // If no sections were extracted, create a single section from rawText
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
    pageCount: ast.metadata.pages ?? undefined,
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
