// src/lib/document-processor/index.ts

import { randomUUID } from 'crypto';
import { validateDocumentUpload } from '../validators/document';
import { parsePdf } from './pdf-parser';
import { parseDocx } from './docx-parser';
import { parseEpub } from './epub-parser';
import { parseXlsx } from './xlsx-parser';
import { parsePptx } from './pptx-parser';

export interface ParsedDocument {
  id: string;
  fileName: string;
  format: SupportedFormat;
  content: DocumentContent;
  metadata: DocumentMetadata;
  parsedAt: Date;
}

export interface DocumentContent {
  sections: ContentSection[];
  rawText: string;
  headings: string[];
  totalCharacters: number;
}

export interface ContentSection {
  title: string;
  body: string;
  order: number;
  level: number; // heading depth (1-5)
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  pageCount?: number;
  wordCount: number;
}

export type SupportedFormat = 'pdf' | 'docx' | 'epub' | 'xlsx' | 'pptx';

export interface ParseResult {
  success: boolean;
  document?: ParsedDocument;
  error?: ParseError;
}

export interface ParseError {
  fileName: string;
  reason: string;
  code: 'UNSUPPORTED_FORMAT' | 'PARSE_FAILURE' | 'FILE_TOO_LARGE' | 'CORRUPTED';
}

const SUPPORTED_EXTENSIONS: SupportedFormat[] = ['pdf', 'docx', 'epub', 'xlsx', 'pptx'];

/**
 * Extracts the file extension from a filename (lowercase, without dot).
 */
function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Determines the supported format from a file extension.
 */
function getFormat(fileName: string): SupportedFormat | null {
  const ext = getFileExtension(fileName);
  if (SUPPORTED_EXTENSIONS.includes(ext as SupportedFormat)) {
    return ext as SupportedFormat;
  }
  return null;
}

/**
 * Orchestrates document parsing across supported formats.
 * Accepts a file buffer and delegates to the appropriate format-specific parser.
 */
export async function parseDocument(
  file: File,
  fileName: string
): Promise<ParseResult> {
  const format = getFormat(fileName);

  if (!format) {
    return {
      success: false,
      error: {
        fileName,
        reason: `Unsupported format ".${getFileExtension(fileName)}". Accepted formats: .pdf, .docx, .epub, .xlsx, .pptx.`,
        code: 'UNSUPPORTED_FORMAT',
      },
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let content: DocumentContent;
    let metadata: DocumentMetadata;

    switch (format) {
      case 'pdf': {
        const result = await parsePdf(buffer, fileName);
        content = result.content;
        metadata = result.metadata;
        break;
      }
      case 'docx': {
        const result = await parseDocx(buffer, fileName);
        content = result.content;
        metadata = result.metadata;
        break;
      }
      case 'epub': {
        const result = await parseEpub(buffer, fileName);
        content = result.content;
        metadata = result.metadata;
        break;
      }
      case 'xlsx': {
        const result = await parseXlsx(buffer, fileName);
        content = result.content;
        metadata = result.metadata;
        break;
      }
      case 'pptx': {
        const result = await parsePptx(buffer, fileName);
        content = result.content;
        metadata = result.metadata;
        break;
      }
    }

    const document: ParsedDocument = {
      id: randomUUID(),
      fileName,
      format,
      content,
      metadata,
      parsedAt: new Date(),
    };

    return { success: true, document };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parsing error';

    // Determine error code based on error message patterns
    const isCorrupted =
      message.toLowerCase().includes('corrupt') ||
      message.toLowerCase().includes('invalid') ||
      message.toLowerCase().includes('malformed') ||
      message.toLowerCase().includes('bad') ||
      message.toLowerCase().includes('broken');

    return {
      success: false,
      error: {
        fileName,
        reason: `Failed to parse "${fileName}": ${message}`,
        code: isCorrupted ? 'CORRUPTED' : 'PARSE_FAILURE',
      },
    };
  }
}

/**
 * Parses multiple documents, returning results for each.
 * Continues processing remaining files even if individual files fail.
 */
export async function parseDocuments(
  files: File[]
): Promise<ParseResult[]> {
  const results: ParseResult[] = [];

  for (const file of files) {
    const result = await parseDocument(file, file.name);
    results.push(result);
  }

  return results;
}

/**
 * Validates that a file meets upload requirements before parsing.
 * Uses the validation logic from src/lib/validators/document.ts.
 */
export function validateUpload(file: File, currentFileCount: number = 0): {
  valid: boolean;
  error?: ParseError;
} {
  const validationResult = validateDocumentUpload(
    { name: file.name, size: file.size },
    currentFileCount
  );

  if (validationResult.valid) {
    return { valid: true };
  }

  // Map the validation error to a ParseError
  const errorMessage = validationResult.error ?? 'Validation failed';
  let code: ParseError['code'] = 'PARSE_FAILURE';

  if (errorMessage.includes('Unsupported format')) {
    code = 'UNSUPPORTED_FORMAT';
  } else if (errorMessage.includes('size exceeds')) {
    code = 'FILE_TOO_LARGE';
  }

  return {
    valid: false,
    error: {
      fileName: file.name,
      reason: errorMessage,
      code,
    },
  };
}
