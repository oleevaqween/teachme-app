// src/app/api/documents/route.ts

import { NextResponse } from 'next/server';
import { readdir, readFile, unlink } from 'fs/promises';
import path from 'path';
import { handleApiError } from '@/lib/errors';

interface DocumentSummary {
  id: string;
  fileName: string;
  format: string;
  wordCount: number;
  sectionCount: number;
  parsedAt: string;
}

/**
 * GET /api/documents
 * Lists all previously parsed documents available for reuse.
 * Reads from the uploads/parsed/ directory.
 */
export async function GET() {
  try {
    const parsedDir = path.join(process.cwd(), 'uploads', 'parsed');

    let files: string[];
    try {
      files = await readdir(parsedDir);
    } catch {
      // Directory doesn't exist yet — no documents uploaded
      return NextResponse.json({ documents: [] });
    }

    const documents: DocumentSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(parsedDir, file);
        const content = await readFile(filePath, 'utf-8');
        const doc = JSON.parse(content);

        documents.push({
          id: doc.id,
          fileName: doc.fileName,
          format: doc.format,
          wordCount: doc.metadata?.wordCount ?? 0,
          sectionCount: doc.content?.sections?.length ?? 0,
          parsedAt: doc.parsedAt,
        });
      } catch {
        // Skip malformed files
        continue;
      }
    }

    // Sort by most recently parsed first
    documents.sort((a, b) => new Date(b.parsedAt).getTime() - new Date(a.parsedAt).getTime());

    return NextResponse.json({ documents });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/documents
 * Deletes a parsed document by ID.
 * Body: { id: string }
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Document ID is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const parsedDir = path.join(process.cwd(), 'uploads', 'parsed');
    const filePath = path.join(parsedDir, `${id}.json`);

    try {
      await unlink(filePath);
    } catch {
      return NextResponse.json(
        { error: 'Document not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
