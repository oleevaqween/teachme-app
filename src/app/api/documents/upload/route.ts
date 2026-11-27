// src/app/api/documents/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { validateDocumentUpload } from '@/lib/validators/document';
import { parseDocument, type ParseResult } from '@/lib/document-processor';
import { handleApiError } from '@/lib/errors';

/**
 * POST /api/documents/upload
 *
 * Accepts multipart FormData with one or more files.
 * Validates each file (format, size, count), stores temporarily in uploads/,
 * parses via document processor, saves parsed content as JSON for later retrieval,
 * and returns per-file results (with document IDs, not full content).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided. Please upload at least one document.', code: 'PARSE_FAILURE', retryable: false },
        { status: 400 }
      );
    }

    // Ensure directories exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const parsedDir = path.join(process.cwd(), 'uploads', 'parsed');
    await mkdir(uploadsDir, { recursive: true });
    await mkdir(parsedDir, { recursive: true });

    const results: ParseResult[] = [];
    let currentFileCount = 0;

    for (const file of files) {
      // Validate each file against upload rules
      const validation = validateDocumentUpload(
        { name: file.name, size: file.size },
        currentFileCount
      );

      if (!validation.valid) {
        results.push({
          success: false,
          error: {
            fileName: file.name,
            reason: validation.error!,
            code: getErrorCode(validation.error!),
          },
        });
        continue;
      }

      // Store file temporarily in uploads/ directory
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const filePath = path.join(uploadsDir, `${Date.now()}-${file.name}`);
        await writeFile(filePath, buffer);
      } catch {
        // Non-critical: continue with parsing from memory
      }

      // Parse the document
      const parseResult = await parseDocument(file, file.name);
      results.push(parseResult);

      // Save parsed content as JSON for the generate endpoint to read
      if (parseResult.success && parseResult.document) {
        const parsedFilePath = path.join(parsedDir, `${parseResult.document.id}.json`);
        await writeFile(parsedFilePath, JSON.stringify(parseResult.document));
      }

      if (parseResult.success) {
        currentFileCount++;
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Maps validation error messages to ParseError codes.
 */
function getErrorCode(errorMessage: string): 'UNSUPPORTED_FORMAT' | 'PARSE_FAILURE' | 'FILE_TOO_LARGE' | 'CORRUPTED' {
  if (errorMessage.includes('Unsupported format')) {
    return 'UNSUPPORTED_FORMAT';
  }
  if (errorMessage.includes('size exceeds')) {
    return 'FILE_TOO_LARGE';
  }
  if (errorMessage.includes('Maximum of')) {
    return 'UNSUPPORTED_FORMAT';
  }
  return 'PARSE_FAILURE';
}
