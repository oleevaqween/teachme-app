// src/lib/validators/document.ts

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_FILES_PER_SESSION = 20;
export const SUPPORTED_FORMATS = ['pdf', 'docx', 'epub', 'xlsx', 'pptx'] as const;

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

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
 * Validates file format and size for document upload.
 * Checks: format in {pdf, docx, epub, xlsx, pptx}, size ≤ 100MB, count < 20.
 */
export function validateDocumentUpload(
  file: { name: string; size: number },
  currentFileCount: number
): ValidationResult {
  // Check file count limit first
  if (currentFileCount >= MAX_FILES_PER_SESSION) {
    return {
      valid: false,
      error: `Maximum of ${MAX_FILES_PER_SESSION} documents per session exceeded. You have already uploaded ${currentFileCount} files.`,
    };
  }

  // Check file format
  const extension = getFileExtension(file.name);
  if (!SUPPORTED_FORMATS.includes(extension as SupportedFormat)) {
    return {
      valid: false,
      error: `Unsupported format ".${extension}". Accepted formats: ${SUPPORTED_FORMATS.map(f => `.${f}`).join(', ')}.`,
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds the maximum allowed size of 100 MB. File "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
    };
  }

  return { valid: true };
}
