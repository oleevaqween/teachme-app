// Property test for source attribution formatting
// Task 7.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatSourceAttribution } from './grounding-engine';
import type { MessageSource } from './index';

/**
 * Property 7: Source attribution formatting
 *
 * For any array of MessageSource objects, the formatSourceAttribution function
 * SHALL produce output where: every document-sourced item is labeled as "Document"
 * with its name, and every web-sourced item includes both a source name and a URL.
 *
 * **Validates: Requirements 6.4, 7.3**
 */

// Generator for document sources
const documentSourceArb: fc.Arbitrary<MessageSource> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((name) => ({
    type: 'document' as const,
    name: name.trim(),
  }));

// Generator for web sources
const webSourceArb: fc.Arbitrary<MessageSource> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    fc.webUrl()
  )
  .map(([name, url]) => ({
    type: 'web' as const,
    name: name.trim(),
    url,
  }));

// Generator for arbitrary MessageSource (mix of document and web)
const messageSourceArb: fc.Arbitrary<MessageSource> = fc.oneof(
  documentSourceArb,
  webSourceArb
);

describe('Property 7: Source attribution formatting', () => {
  it('document sources are labeled as "Document: {name}"', () => {
    fc.assert(
      fc.property(
        fc.array(documentSourceArb, { minLength: 1, maxLength: 10 }),
        (sources) => {
          const result = formatSourceAttribution(sources);

          for (const source of sources) {
            expect(result).toContain(`Document: ${source.name}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('web sources include both name and URL', () => {
    fc.assert(
      fc.property(
        fc.array(webSourceArb, { minLength: 1, maxLength: 10 }),
        (sources) => {
          const result = formatSourceAttribution(sources);

          for (const source of sources) {
            expect(result).toContain(source.name);
            expect(result).toContain(source.url!);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mixed sources: documents have "Document" label and web sources include name and URL', () => {
    fc.assert(
      fc.property(
        fc.array(messageSourceArb, { minLength: 1, maxLength: 10 }),
        (sources) => {
          const result = formatSourceAttribution(sources);

          for (const source of sources) {
            if (source.type === 'document') {
              expect(result).toContain(`Document: ${source.name}`);
            } else {
              expect(result).toContain(source.name);
              expect(result).toContain(source.url!);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty input returns empty string', () => {
    const result = formatSourceAttribution([]);
    expect(result).toBe('');
  });
});
