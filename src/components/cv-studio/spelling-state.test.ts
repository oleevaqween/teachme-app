import { describe, expect, it } from 'vitest';
import type { SpellingOutcome, SpellingResult } from '@/lib/cv-studio/cv-checker';
import { currentSpelling } from './spelling-state';

const result = (word: string): SpellingResult => ({ variant: 'en-GB', words: [{ word, suggestions: [], target: 'summary', where: 'Summary' }], variantWords: [] });
const done = (word: string): SpellingOutcome => ({ status: 'done', result: result(word) });
const PENDING: SpellingOutcome = { status: 'pending' };

describe('currentSpelling', () => {
  it('uses the finished result for the same key', () => {
    expect(currentSpelling({ key: 'k1', outcome: done('a') }, { workspaceId: 'w1', outcome: done('old') }, 'k1', 'w1')).toEqual(done('a'));
  });
  it('keeps the last finished result of the same CV while a new check is pending', () => {
    expect(currentSpelling({ key: 'k1', outcome: done('a') }, { workspaceId: 'w1', outcome: done('a') }, 'k2', 'w1')).toEqual(done('a'));
  });
  it('does not show another CV\'s result', () => {
    expect(currentSpelling({ key: 'k1', outcome: done('a') }, { workspaceId: 'w1', outcome: done('a') }, 'k2', 'w2')).toEqual(PENDING);
  });
  it('is pending when nothing has finished yet', () => {
    expect(currentSpelling({ key: '', outcome: PENDING }, null, 'k1', 'w1')).toEqual(PENDING);
  });
  it('shows a failure for the current key', () => {
    expect(currentSpelling({ key: 'k1', outcome: { status: 'failed' } }, { workspaceId: 'w1', outcome: done('a') }, 'k1', 'w1')).toEqual({ status: 'failed' });
  });
});
