// src/app/api/documents/upload/route.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock the document processor
vi.mock('@/lib/document-processor', () => ({
  parseDocument: vi.fn(),
}));

// Mock fs/promises so we don't write actual files
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Use actual validator implementation
vi.mock('@/lib/validators/document', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validators/document')>();
  return {
    ...actual,
    validateDocumentUpload: vi.fn(actual.validateDocumentUpload),
  };
});

import { parseDocument } from '@/lib/document-processor';
import { validateDocumentUpload } from '@/lib/validators/document';

const mockParseDocument = vi.mocked(parseDocument);
const mockValidateDocumentUpload = vi.mocked(validateDocumentUpload);

function createMockFile(name: string, size: number): File {
  const buffer = Buffer.alloc(Math.min(size, 100), 'x');
  const file = new File([buffer], name, { type: 'application/octet-stream' });
  return file;
}

function createRequest(files: File[]): NextRequest {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file, file.name);
  }
  return new NextRequest('http://localhost:3000/api/documents/upload', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/documents/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when no files are provided', async () => {
    const formData = new FormData();
    const request = new NextRequest('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('No files provided');
  });

  it('successfully processes a valid PDF file', async () => {
    const file = createMockFile('document.pdf', 1024);
    mockParseDocument.mockResolvedValueOnce({
      success: true,
      document: {
        id: 'test-id',
        fileName: 'document.pdf',
        format: 'pdf',
        content: { sections: [], rawText: 'content', headings: [], totalCharacters: 7 },
        metadata: { wordCount: 1 },
        parsedAt: new Date(),
      },
    });

    const request = createRequest([file]);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].document.fileName).toBe('document.pdf');
  });

  it('rejects files with unsupported formats', async () => {
    const file = createMockFile('document.txt', 1024);

    const request = createRequest([file]);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error.code).toBe('UNSUPPORTED_FORMAT');
    expect(body.results[0].error.reason).toContain('Unsupported format');
    expect(body.results[0].error.reason).toContain('.txt');
  });

  it('rejects files exceeding 100MB', async () => {
    const file = createMockFile('large.pdf', 100);

    // Override validator to simulate size rejection
    mockValidateDocumentUpload.mockReturnValueOnce({
      valid: false,
      error: 'File size exceeds the maximum allowed size of 100 MB. File "large.pdf" is 150.0 MB.',
    });

    const request = createRequest([file]);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error.code).toBe('FILE_TOO_LARGE');
  });

  it('continues processing remaining files when one fails', async () => {
    const invalidFile = createMockFile('readme.txt', 1024);
    const validFile = createMockFile('notes.pdf', 2048);

    mockParseDocument.mockResolvedValueOnce({
      success: true,
      document: {
        id: 'test-id-2',
        fileName: 'notes.pdf',
        format: 'pdf',
        content: { sections: [], rawText: 'notes content', headings: [], totalCharacters: 13 },
        metadata: { wordCount: 2 },
        parsedAt: new Date(),
      },
    });

    const request = createRequest([invalidFile, validFile]);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error.fileName).toBe('readme.txt');
    expect(body.results[1].success).toBe(true);
    expect(body.results[1].document.fileName).toBe('notes.pdf');
  });

  it('enforces maximum file count of 20', async () => {
    // Create 21 valid files
    const files: File[] = [];
    for (let i = 0; i < 21; i++) {
      files.push(createMockFile(`file${i}.pdf`, 1024));
    }

    // Mock successful parse for first 20 files
    for (let i = 0; i < 20; i++) {
      mockParseDocument.mockResolvedValueOnce({
        success: true,
        document: {
          id: `id-${i}`,
          fileName: `file${i}.pdf`,
          format: 'pdf',
          content: { sections: [], rawText: '', headings: [], totalCharacters: 0 },
          metadata: { wordCount: 0 },
          parsedAt: new Date(),
        },
      });
    }

    const request = createRequest(files);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(21);

    // First 20 should succeed
    for (let i = 0; i < 20; i++) {
      expect(body.results[i].success).toBe(true);
    }

    // 21st should fail with max files exceeded
    expect(body.results[20].success).toBe(false);
    expect(body.results[20].error.reason).toContain('Maximum of 20');
  });

  it('handles parse failure gracefully', async () => {
    const file = createMockFile('corrupt.pdf', 1024);

    mockParseDocument.mockResolvedValueOnce({
      success: false,
      error: {
        fileName: 'corrupt.pdf',
        reason: 'Failed to parse "corrupt.pdf": File is corrupted',
        code: 'CORRUPTED',
      },
    });

    const request = createRequest([file]);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error.code).toBe('CORRUPTED');
    expect(body.results[0].error.fileName).toBe('corrupt.pdf');
  });
});
