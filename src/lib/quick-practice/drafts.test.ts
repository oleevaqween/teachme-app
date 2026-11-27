import { describe, expect, it } from 'vitest';
import { draftKey, isCancelled } from './drafts';

describe('quick practice drafts', () => {
  it('keeps a separate draft slot for the main answer and each follow-up', () => {
    expect(draftKey('q1', null)).toBe('q1:main');
    expect(draftKey('q1', 'a1')).toBe('q1:a1');
    expect(draftKey('q2', null)).not.toBe(draftKey('q1', null));
  });

  it('recognises a cancelled request and nothing else', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(isCancelled(abort)).toBe(true);
    expect(isCancelled(new DOMException('The operation was aborted.', 'AbortError'))).toBe(true);
    expect(isCancelled(new Error('network down'))).toBe(false);
    expect(isCancelled('AbortError')).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });
});
