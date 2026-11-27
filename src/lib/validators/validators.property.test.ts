// Property tests for input validators
// Tasks 2.2, 2.3, 2.4, 2.5

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTopic } from './topic';
import { validateRole } from './interview';
import {
  validateDocumentUpload,
  SUPPORTED_FORMATS,
  MAX_FILE_SIZE,
  MAX_FILES_PER_SESSION,
} from './document';

/**
 * Property 1: Input Length Validation
 *
 * For any string input and a given validator configured with min/max bounds
 * (topic: 3-200, role: 2-100, answer: 20-∞), the validator SHALL accept
 * the string if and only if its trimmed length falls within the configured bounds.
 *
 * **Validates: Requirements 2.3, 5.2, 6.6**
 */
describe('Property 1: Input Length Validation', () => {
  it('validateTopic accepts iff trimmed length is within [3, 200]', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        const trimmedLength = input.trim().length;
        const result = validateTopic(input);

        if (trimmedLength >= 3 && trimmedLength <= 200) {
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        } else {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('validateRole accepts iff trimmed length is within [2, 100]', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        const trimmedLength = input.trim().length;
        const result = validateRole(input);

        if (trimmedLength >= 2 && trimmedLength <= 100) {
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        } else {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });

});

/**
 * Property 2: Document Upload Validation
 *
 * For any file with a given extension and size, the upload validator SHALL accept
 * the file if and only if its extension is one of {pdf, docx, epub, xlsx, pptx},
 * its size is ≤ 100 MB, and the current session file count is < 20.
 *
 * **Validates: Requirements 1.1, 1.5**
 */
describe('Property 2: Document Upload Validation', () => {
  const allExtensions = [...SUPPORTED_FORMATS, 'txt', 'jpg', 'png', 'mp4', 'zip', 'html', 'csv', 'doc', 'rtf'];

  it('accepts iff extension ∈ supported AND size ≤ 100MB AND count < 20', () => {
    fc.assert(
      fc.property(
        fc.record({
          extension: fc.constantFrom(...allExtensions),
          size: fc.integer({ min: 0, max: 150 * 1024 * 1024 }), // 0 to 150MB
          fileCount: fc.integer({ min: 0, max: 30 }),
        }),
        ({ extension, size, fileCount }) => {
          const file = { name: `document.${extension}`, size };
          const result = validateDocumentUpload(file, fileCount);

          const isFormatValid = (SUPPORTED_FORMATS as readonly string[]).includes(extension);
          const isSizeValid = size <= MAX_FILE_SIZE;
          const isCountValid = fileCount < MAX_FILES_PER_SESSION;

          if (isFormatValid && isSizeValid && isCountValid) {
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
          } else {
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: Unsupported Format Error Message Completeness
 *
 * For any file with an extension not in the set of accepted formats, the error
 * response SHALL contain both the unsupported extension name and the complete
 * list of accepted formats.
 *
 * **Validates: Requirements 1.3, 8.2**
 */
describe('Property 3: Unsupported Format Error Message Completeness', () => {
  // Generate extensions that are NOT in the supported set
  const unsupportedExtensions = ['txt', 'jpg', 'png', 'mp4', 'zip', 'html', 'csv', 'doc', 'rtf', 'odt', 'bmp', 'wav'];

  it('error message contains both the unsupported extension and all accepted formats', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...unsupportedExtensions),
        (extension) => {
          const file = { name: `file.${extension}`, size: 1024 }; // Small valid size
          const result = validateDocumentUpload(file, 0); // Valid count

          // Should be rejected due to unsupported format
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();

          // Error must contain the unsupported extension
          expect(result.error!).toContain(extension);

          // Error must contain all accepted formats
          for (const format of SUPPORTED_FORMATS) {
            expect(result.error!).toContain(format);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
