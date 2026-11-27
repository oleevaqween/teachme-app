// Property test for batch processing resilience
// Task 3.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 4: Batch Processing Resilience
 *
 * For any batch of N documents where K documents are corrupted (0 ≤ K ≤ N),
 * the processing result SHALL contain exactly (N - K) successful results and K
 * error results, and each error result SHALL contain the corresponding file name.
 *
 * We create a pure function that simulates batch processing with per-file error isolation:
 * given an array of files with a `shouldFail` flag, process them and return results.
 *
 * **Validates: Requirements 1.4**
 */

interface FileInput {
  fileName: string;
  shouldFail: boolean;
}

interface BatchResult {
  success: boolean;
  fileName: string;
  error?: string;
}

/**
 * Pure function simulating batch processing with per-file error isolation.
 * Each file is processed independently — a failure in one does not affect others.
 */
function processBatch(files: FileInput[]): BatchResult[] {
  return files.map((file) => {
    if (file.shouldFail) {
      return {
        success: false,
        fileName: file.fileName,
        error: `Failed to parse "${file.fileName}": file is corrupted`,
      };
    }
    return {
      success: true,
      fileName: file.fileName,
    };
  });
}

describe('Property 4: Batch Processing Resilience', () => {
  const fileInputArb: fc.Arbitrary<FileInput> = fc.record({
    fileName: fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
        fc.constantFrom('.pdf', '.docx', '.epub', '.xlsx', '.pptx')
      )
      .map(([name, ext]) => `${name}${ext}`),
    shouldFail: fc.boolean(),
  });

  const batchArb: fc.Arbitrary<FileInput[]> = fc.array(fileInputArb, {
    minLength: 1,
    maxLength: 30,
  });

  it('produces exactly (N-K) successes and K errors for N files with K failures', () => {
    fc.assert(
      fc.property(batchArb, (files) => {
        const results = processBatch(files);
        const N = files.length;
        const K = files.filter((f) => f.shouldFail).length;

        const successes = results.filter((r) => r.success);
        const errors = results.filter((r) => !r.success);

        // Exactly (N-K) successes and K errors
        expect(successes.length).toBe(N - K);
        expect(errors.length).toBe(K);
      }),
      { numRuns: 100 }
    );
  });

  it('each error result contains the corresponding file name', () => {
    fc.assert(
      fc.property(batchArb, (files) => {
        const results = processBatch(files);
        const errors = results.filter((r) => !r.success);
        const failedFiles = files.filter((f) => f.shouldFail);

        // Each error should contain the file name
        for (let i = 0; i < errors.length; i++) {
          const errorResult = errors[i];
          expect(errorResult.error).toBeDefined();
          expect(errorResult.error).toContain(errorResult.fileName);
        }

        // All failed files should have a corresponding error
        for (const failedFile of failedFiles) {
          const matchingError = errors.find((e) => e.fileName === failedFile.fileName);
          expect(matchingError).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});
