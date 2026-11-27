import { describe, it, expect } from 'vitest';
import {
  validateDocumentUpload,
  MAX_FILE_SIZE,
  SUPPORTED_FORMATS,
} from './document';

describe('validateDocumentUpload', () => {
  it('accepts a valid PDF file with room in session', () => {
    const file = { name: 'document.pdf', size: 1024 };
    expect(validateDocumentUpload(file, 0)).toEqual({ valid: true });
  });

  it('accepts all supported formats', () => {
    for (const format of SUPPORTED_FORMATS) {
      const file = { name: `file.${format}`, size: 1024 };
      expect(validateDocumentUpload(file, 0)).toEqual({ valid: true });
    }
  });

  it('accepts a file at exactly 100 MB', () => {
    const file = { name: 'large.pdf', size: MAX_FILE_SIZE };
    expect(validateDocumentUpload(file, 0)).toEqual({ valid: true });
  });

  it('accepts when currentFileCount is 19 (one slot left)', () => {
    const file = { name: 'file.pdf', size: 1024 };
    expect(validateDocumentUpload(file, 19)).toEqual({ valid: true });
  });

  it('rejects when currentFileCount is 20 (session full)', () => {
    const file = { name: 'file.pdf', size: 1024 };
    const result = validateDocumentUpload(file, 20);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('20');
  });

  it('rejects an unsupported format with extension and accepted list in error', () => {
    const file = { name: 'image.png', size: 1024 };
    const result = validateDocumentUpload(file, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('.png');
    // Must include all accepted formats
    for (const format of SUPPORTED_FORMATS) {
      expect(result.error).toContain(`.${format}`);
    }
  });

  it('rejects a file exceeding 100 MB', () => {
    const file = { name: 'huge.pdf', size: MAX_FILE_SIZE + 1 };
    const result = validateDocumentUpload(file, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('100 MB');
  });

  it('rejects a file with no extension', () => {
    const file = { name: 'noextension', size: 1024 };
    const result = validateDocumentUpload(file, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported format');
  });

  it('handles case-insensitive extensions', () => {
    const file = { name: 'document.PDF', size: 1024 };
    expect(validateDocumentUpload(file, 0)).toEqual({ valid: true });
  });
});
