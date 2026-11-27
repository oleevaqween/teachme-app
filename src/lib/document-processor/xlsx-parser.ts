// src/lib/document-processor/xlsx-parser.ts

import { parseOffice } from 'officeparser';
import type { DocumentContent, ContentSection, DocumentMetadata } from './index';

export interface XlsxParseResult {
  content: DocumentContent;
  metadata: DocumentMetadata;
}

/**
 * Parses an XLSX file buffer and extracts text and sheet-based sections.
 * Uses officeparser for Excel spreadsheet parsing.
 */
export async function parseXlsx(buffer: Buffer, fileName: string): Promise<XlsxParseResult> {
  const ast = await parseOffice(buffer, { fileType: 'xlsx' });

  const rawText = ast.toText();
  const headings: string[] = [];
  const sections: ContentSection[] = [];
  let sectionOrder = 0;

  // XLSX content is organized by sheets
  for (const node of ast.content) {
    if (node.type === 'sheet') {
      const sheetName = node.metadata?.sheetName ?? `Sheet ${sectionOrder + 1}`;
      headings.push(sheetName);

      // Collect all text from the sheet's children (rows/cells)
      let sheetText = '';
      if (node.children) {
        for (const row of node.children) {
          if (row.text) {
            sheetText += (sheetText ? '\n' : '') + row.text;
          }
        }
      }

      // Fall back to node.text if children didn't yield content
      if (!sheetText && node.text) {
        sheetText = node.text;
      }

      sections.push({
        title: sheetName,
        body: sheetText,
        order: sectionOrder++,
        level: 1,
      });
    }
  }

  // If no sheet nodes found, create a single section from rawText
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
    pageCount: undefined,
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
