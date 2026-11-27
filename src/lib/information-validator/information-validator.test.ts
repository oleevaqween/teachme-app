import { describe, it, expect } from 'vitest';
import { verifyClaim, crossReferenceWithDocument, verifyBatch } from './index';
import { assignConfidenceLevel, meetsVerificationThreshold } from './confidence-scorer';
import { searchWeb } from './web-search';
import type { ParsedDocument } from '@/lib/document-processor';

// --- Confidence Scorer Tests ---

describe('confidence-scorer', () => {
  describe('assignConfidenceLevel', () => {
    it('returns High for 3 or more sources', () => {
      expect(assignConfidenceLevel(3)).toBe('High');
      expect(assignConfidenceLevel(4)).toBe('High');
      expect(assignConfidenceLevel(10)).toBe('High');
    });

    it('returns Medium for exactly 2 sources', () => {
      expect(assignConfidenceLevel(2)).toBe('Medium');
    });

    it('returns Low for exactly 1 source', () => {
      expect(assignConfidenceLevel(1)).toBe('Low');
    });

    it('throws error for sourceCount less than 1', () => {
      expect(() => assignConfidenceLevel(0)).toThrow();
      expect(() => assignConfidenceLevel(-1)).toThrow();
    });
  });

  describe('meetsVerificationThreshold', () => {
    it('returns true for 1 or more sources', () => {
      expect(meetsVerificationThreshold(1)).toBe(true);
      expect(meetsVerificationThreshold(5)).toBe(true);
    });

    it('returns false for 0 sources', () => {
      expect(meetsVerificationThreshold(0)).toBe(false);
    });
  });
});

// --- Web Search Tests ---

describe('web-search', () => {
  it('returns results for a query', async () => {
    const results = await searchWeb('photosynthesis in plants');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('url');
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('snippet');
    expect(results[0]).toHaveProperty('available');
  });

  it('respects maxResults option', async () => {
    const results = await searchWeb('quantum physics', { maxResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('throws on aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      searchWeb('test query', { signal: controller.signal })
    ).rejects.toThrow();
  });
});

// --- Cross-Reference Tests ---

describe('crossReferenceWithDocument', () => {
  const mockDocument: ParsedDocument = {
    id: 'doc-1',
    fileName: 'test.pdf',
    format: 'pdf',
    content: {
      sections: [
        {
          title: 'Introduction to Photosynthesis',
          body: 'Photosynthesis is the process by which plants convert sunlight into energy. Chlorophyll is the key pigment that absorbs light.',
          order: 1,
          level: 1,
        },
        {
          title: 'Cellular Respiration',
          body: 'Cellular respiration is the process of breaking down glucose to produce ATP. Mitochondria are the powerhouses of the cell.',
          order: 2,
          level: 1,
        },
      ],
      rawText:
        'Photosynthesis is the process by which plants convert sunlight into energy. Chlorophyll is the key pigment that absorbs light. Cellular respiration is the process of breaking down glucose to produce ATP. Mitochondria are the powerhouses of the cell.',
      headings: ['Introduction to Photosynthesis', 'Cellular Respiration'],
      totalCharacters: 250,
    },
    metadata: { wordCount: 40 },
    parsedAt: new Date(),
  };

  it('aligns when claim is an exact substring of the document', async () => {
    const result = await crossReferenceWithDocument(
      'Chlorophyll is the key pigment that absorbs light',
      mockDocument
    );
    expect(result.aligned).toBe(true);
  });

  it('aligns when significant keywords overlap with a section', async () => {
    const result = await crossReferenceWithDocument(
      'plants use chlorophyll to absorb sunlight for photosynthesis',
      mockDocument
    );
    expect(result.aligned).toBe(true);
    expect(result.matchedSection).toBeDefined();
  });

  it('does not align when claim has no overlap', async () => {
    const result = await crossReferenceWithDocument(
      'Machine learning algorithms optimize neural network weights',
      mockDocument
    );
    expect(result.aligned).toBe(false);
  });

  it('returns not aligned for empty claim', async () => {
    const result = await crossReferenceWithDocument('', mockDocument);
    expect(result.aligned).toBe(false);
  });
});

// --- verifyClaim Tests ---

describe('verifyClaim', () => {
  it('returns a verified result with sources', async () => {
    const result = await verifyClaim('The Earth orbits the Sun');
    expect(result.claim).toBe('The Earth orbits the Sun');
    expect(result.verified).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.timedOut).toBe(false);
  });

  it('assigns confidence level based on source count', async () => {
    const result = await verifyClaim('Water boils at 100 degrees Celsius');
    expect(['High', 'Medium', 'Low']).toContain(result.confidenceLevel);
  });

  it('returns timedOut=true when timeout expires', async () => {
    // Use an extremely short timeout to trigger timeout
    const result = await verifyClaim('Some claim to verify', 1);
    // With 1ms timeout, the async search should be aborted
    expect(result.timedOut).toBe(true);
    expect(result.verified).toBe(false);
  });
});

// --- verifyBatch Tests ---

describe('verifyBatch', () => {
  it('returns empty array for empty input', async () => {
    const results = await verifyBatch([]);
    expect(results).toEqual([]);
  });

  it('verifies multiple claims in parallel', async () => {
    const claims = [
      'The sky is blue',
      'Water is composed of hydrogen and oxygen',
      'The speed of light is approximately 300,000 km/s',
    ];
    const results = await verifyBatch(claims);

    expect(results).toHaveLength(3);
    results.forEach((result, index) => {
      expect(result.claim).toBe(claims[index]);
      expect(typeof result.verified).toBe('boolean');
      expect(['High', 'Medium', 'Low']).toContain(result.confidenceLevel);
    });
  });

  it('handles all claims even if some would be unverified', async () => {
    const claims = ['Claim A', 'Claim B'];
    const results = await verifyBatch(claims);

    expect(results).toHaveLength(2);
    // Each result should have the correct claim text
    expect(results[0].claim).toBe('Claim A');
    expect(results[1].claim).toBe('Claim B');
  });
});
