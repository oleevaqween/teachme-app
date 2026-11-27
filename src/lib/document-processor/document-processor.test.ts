// src/lib/document-processor/document-processor.test.ts
// Task 3.3: Unit tests for document processor

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all format-specific parsers
vi.mock('./pdf-parser', () => ({
  parsePdf: vi.fn(),
}));
vi.mock('./docx-parser', () => ({
  parseDocx: vi.fn(),
}));
vi.mock('./epub-parser', () => ({
  parseEpub: vi.fn(),
}));
vi.mock('./xlsx-parser', () => ({
  parseXlsx: vi.fn(),
}));
vi.mock('./pptx-parser', () => ({
  parsePptx: vi.fn(),
}));

// Mock the document validator
vi.mock('@/lib/validators/document', () => ({
  validateDocumentUpload: vi.fn(),
}));

import { parseDocument, parseDocuments, validateUpload } from './index';
import { parsePdf } from './pdf-parser';
import { parseDocx } from './docx-parser';
import { parseEpub } from './epub-parser';
import { parseXlsx } from './xlsx-parser';
import { parsePptx } from './pptx-parser';
import { validateDocumentUpload } from '@/lib/validators/document';

const mockParsePdf = vi.mocked(parsePdf);
const mockParseDocx = vi.mocked(parseDocx);
const mockParseEpub = vi.mocked(parseEpub);
const mockParseXlsx = vi.mocked(parseXlsx);
const mockParsePptx = vi.mocked(parsePptx);
const mockValidateDocumentUpload = vi.mocked(validateDocumentUpload);

function createMockFile(name: string, size: number = 1024): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type: 'application/octet-stream' });
}

const mockParserResult = {
  content: {
    sections: [{ title: 'Section 1', body: 'Content', order: 1, level: 1 }],
    rawText: 'Content',
    headings: ['Section 1'],
    totalCharacters: 7,
  },
  metadata: { wordCount: 1 },
};

describe('Document Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Format detection and parser delegation', () => {
    it('delegates .pdf files to parsePdf', async () => {
      mockParsePdf.mockResolvedValueOnce(mockParserResult);

      const file = createMockFile('report.pdf');
      const result = await parseDocument(file, 'report.pdf');

      expect(result.success).toBe(true);
      expect(result.document?.format).toBe('pdf');
      expect(mockParsePdf).toHaveBeenCalledOnce();
    });

    it('delegates .docx files to parseDocx', async () => {
      mockParseDocx.mockResolvedValueOnce(mockParserResult);

      const file = createMockFile('doc.docx');
      const result = await parseDocument(file, 'doc.docx');

      expect(result.success).toBe(true);
      expect(result.document?.format).toBe('docx');
      expect(mockParseDocx).toHaveBeenCalledOnce();
    });

    it('delegates .epub files to parseEpub', async () => {
      mockParseEpub.mockResolvedValueOnce(mockParserResult);

      const file = createMockFile('book.epub');
      const result = await parseDocument(file, 'book.epub');

      expect(result.success).toBe(true);
      expect(result.document?.format).toBe('epub');
      expect(mockParseEpub).toHaveBeenCalledOnce();
    });

    it('delegates .xlsx files to parseXlsx', async () => {
      mockParseXlsx.mockResolvedValueOnce(mockParserResult);

      const file = createMockFile('data.xlsx');
      const result = await parseDocument(file, 'data.xlsx');

      expect(result.success).toBe(true);
      expect(result.document?.format).toBe('xlsx');
      expect(mockParseXlsx).toHaveBeenCalledOnce();
    });

    it('delegates .pptx files to parsePptx', async () => {
      mockParsePptx.mockResolvedValueOnce(mockParserResult);

      const file = createMockFile('slides.pptx');
      const result = await parseDocument(file, 'slides.pptx');

      expect(result.success).toBe(true);
      expect(result.document?.format).toBe('pptx');
      expect(mockParsePptx).toHaveBeenCalledOnce();
    });

    it('is case-insensitive for file extensions', async () => {
      mockParsePdf.mockResolvedValueOnce(mockParserResult);

      const file = createMockFile('REPORT.PDF');
      const result = await parseDocument(file, 'REPORT.PDF');

      expect(result.success).toBe(true);
      expect(result.document?.format).toBe('pdf');
    });
  });

  describe('Edge cases', () => {
    it('returns UNSUPPORTED_FORMAT error for empty file name', async () => {
      const file = createMockFile('');
      const result = await parseDocument(file, '');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('returns UNSUPPORTED_FORMAT error for file without extension', async () => {
      const file = createMockFile('noextension');
      const result = await parseDocument(file, 'noextension');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('returns UNSUPPORTED_FORMAT error for file with trailing dot', async () => {
      const file = createMockFile('file.');
      const result = await parseDocument(file, 'file.');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('returns UNSUPPORTED_FORMAT for unknown extensions', async () => {
      const file = createMockFile('readme.txt');
      const result = await parseDocument(file, 'readme.txt');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
      expect(result.error?.reason).toContain('.txt');
      expect(result.error?.reason).toContain('.pdf');
    });

    it('handles parser throwing a "corrupted" error', async () => {
      mockParsePdf.mockRejectedValueOnce(new Error('File is corrupted'));

      const file = createMockFile('bad.pdf');
      const result = await parseDocument(file, 'bad.pdf');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CORRUPTED');
      expect(result.error?.fileName).toBe('bad.pdf');
    });

    it('handles parser throwing a generic error', async () => {
      mockParsePdf.mockRejectedValueOnce(new Error('Unexpected EOF'));

      const file = createMockFile('broken.pdf');
      const result = await parseDocument(file, 'broken.pdf');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PARSE_FAILURE');
      expect(result.error?.fileName).toBe('broken.pdf');
    });
  });

  describe('validateUpload', () => {
    it('returns valid when document validator passes', () => {
      mockValidateDocumentUpload.mockReturnValueOnce({ valid: true });

      const file = createMockFile('doc.pdf');
      const result = validateUpload(file, 0);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockValidateDocumentUpload).toHaveBeenCalledWith(
        { name: 'doc.pdf', size: file.size },
        0
      );
    });

    it('maps unsupported format errors correctly', () => {
      mockValidateDocumentUpload.mockReturnValueOnce({
        valid: false,
        error: 'Unsupported format ".txt". Accepted formats: .pdf, .docx, .epub, .xlsx, .pptx.',
      });

      const file = createMockFile('readme.txt');
      const result = validateUpload(file, 0);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('maps file size errors correctly', () => {
      mockValidateDocumentUpload.mockReturnValueOnce({
        valid: false,
        error: 'File size exceeds the maximum allowed size of 100 MB.',
      });

      const file = createMockFile('large.pdf');
      const result = validateUpload(file, 0);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('FILE_TOO_LARGE');
    });

    it('passes currentFileCount to the document validator', () => {
      mockValidateDocumentUpload.mockReturnValueOnce({ valid: true });

      const file = createMockFile('doc.pdf');
      validateUpload(file, 15);

      expect(mockValidateDocumentUpload).toHaveBeenCalledWith(
        { name: 'doc.pdf', size: file.size },
        15
      );
    });
  });

  describe('parseDocuments batch processing', () => {
    it('processes multiple files and returns results for each', async () => {
      mockParsePdf.mockResolvedValueOnce(mockParserResult);
      mockParseDocx.mockResolvedValueOnce(mockParserResult);

      const files = [
        createMockFile('file1.pdf'),
        createMockFile('file2.docx'),
      ];

      const results = await parseDocuments(files);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('continues processing when individual files fail', async () => {
      mockParsePdf.mockRejectedValueOnce(new Error('corrupted file'));
      mockParseDocx.mockResolvedValueOnce(mockParserResult);

      const files = [
        createMockFile('bad.pdf'),
        createMockFile('good.docx'),
      ];

      const results = await parseDocuments(files);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[0].error?.fileName).toBe('bad.pdf');
      expect(results[1].success).toBe(true);
    });

    it('handles unsupported formats within a batch', async () => {
      mockParsePdf.mockResolvedValueOnce(mockParserResult);

      const files = [
        createMockFile('valid.pdf'),
        createMockFile('invalid.txt'),
      ];

      const results = await parseDocuments(files);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('returns empty array for empty input', async () => {
      const results = await parseDocuments([]);
      expect(results).toHaveLength(0);
    });
  });
});
