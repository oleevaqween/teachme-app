import { describe, it, expect } from 'vitest';
import { detectMessageIntent } from './intent-detector';

describe('detectMessageIntent', () => {
  it('returns "lecture" for "continue"', () => {
    expect(detectMessageIntent('continue')).toBe('lecture');
  });

  it('returns "lecture" for "thank you"', () => {
    expect(detectMessageIntent('thank you')).toBe('lecture');
  });

  it('returns "lecture" for "okay"', () => {
    expect(detectMessageIntent('okay')).toBe('lecture');
  });

  it('returns "lecture" for "let\'s get back to the lesson"', () => {
    expect(detectMessageIntent("let's get back to the lesson")).toBe('lecture');
  });

  it('returns "lecture" for "got it"', () => {
    expect(detectMessageIntent('got it')).toBe('lecture');
  });

  it('returns "lecture" for "makes sense"', () => {
    expect(detectMessageIntent('makes sense')).toBe('lecture');
  });

  it('returns "lecture" for "alright"', () => {
    expect(detectMessageIntent('alright')).toBe('lecture');
  });

  it('returns "lecture" for "can we continue"', () => {
    expect(detectMessageIntent('can we continue')).toBe('lecture');
  });

  it('returns "lecture" for "noted"', () => {
    expect(detectMessageIntent('noted')).toBe('lecture');
  });

  it('returns "lecture" for "understood"', () => {
    expect(detectMessageIntent('understood')).toBe('lecture');
  });

  it('is case-insensitive', () => {
    expect(detectMessageIntent('THANK YOU')).toBe('lecture');
    expect(detectMessageIntent('Continue')).toBe('lecture');
    expect(detectMessageIntent('OKAY')).toBe('lecture');
  });

  it('ignores leading/trailing whitespace', () => {
    expect(detectMessageIntent('  continue  ')).toBe('lecture');
    expect(detectMessageIntent('  thank you  ')).toBe('lecture');
  });

  it('returns "qa" for a genuine question', () => {
    expect(detectMessageIntent('what is the difference between risk and uncertainty?')).toBe('qa');
  });

  it('returns "qa" for a detailed question', () => {
    expect(detectMessageIntent('can you explain how salience models work?')).toBe('qa');
  });

  it('returns "qa" for an empty string', () => {
    expect(detectMessageIntent('')).toBe('qa');
  });

  it('returns "lecture" for "let\'s move on"', () => {
    expect(detectMessageIntent("let's move on")).toBe('lecture');
  });

  it('returns "lecture" for "that clears it up"', () => {
    expect(detectMessageIntent('that clears it up')).toBe('lecture');
  });

  it('returns "lecture" for "back to the lesson"', () => {
    expect(detectMessageIntent('back to the lesson')).toBe('lecture');
  });

  it('returns "lecture" for "what\'s next"', () => {
    expect(detectMessageIntent("what's next")).toBe('lecture');
  });
});
