// src/lib/journey-map-generator/content-pool.ts

import type { ContentSection, ParsedDocument } from '@/lib/document-processor';

/**
 * A content section enriched with source document metadata.
 * Preserves the original ContentSection fields and adds traceability
 * back to the originating document.
 */
export interface PooledContentSection extends ContentSection {
  sourceDocument: string; // fileName of the originating document
  sourceDocumentId: string; // id of the originating ParsedDocument
}

/**
 * Combines all content sections from all parsed documents into a single
 * unified content pool. Each section is annotated with its source document
 * metadata for downstream traceability (e.g., during chunking and stage assignment).
 *
 * This is a pure function with no side effects.
 *
 * @param documents - Array of parsed documents to combine
 * @returns Flat array of all content sections with source metadata preserved
 */
export function buildUnifiedContentPool(
  documents: ParsedDocument[]
): PooledContentSection[] {
  const pool: PooledContentSection[] = [];

  for (const document of documents) {
    for (const section of document.content.sections) {
      pool.push({
        ...section,
        sourceDocument: document.fileName,
        sourceDocumentId: document.id,
      });
    }
  }

  return pool;
}
