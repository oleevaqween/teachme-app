import { describe, it, expect } from 'vitest';
import { LOADING_PHRASES, getRandomPhrase } from './loading-phrases';

describe('LOADING_PHRASES', () => {
  it('has at least 20 phrases', () => {
    expect(LOADING_PHRASES.length).toBeGreaterThanOrEqual(20);
  });

  it('has no duplicate phrases', () => {
    const unique = new Set(LOADING_PHRASES);
    expect(unique.size).toBe(LOADING_PHRASES.length);
  });

  it('every phrase is a non-empty string', () => {
    for (const phrase of LOADING_PHRASES) {
      expect(typeof phrase).toBe('string');
      expect(phrase.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('getRandomPhrase', () => {
  it('returns a string from the phrases list', () => {
    const phrase = getRandomPhrase();
    expect(LOADING_PHRASES).toContain(phrase);
  });

  it('does not always return the same phrase (probabilistic)', () => {
    const results = new Set(Array.from({ length: 50 }, () => getRandomPhrase()));
    expect(results.size).toBeGreaterThan(1);
  });
});
