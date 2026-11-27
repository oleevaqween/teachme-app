import { describe, expect, it } from 'vitest';
import { appendSpokenText, inputMethodFor, recognitionCtor } from './useSpeechInput';

describe('speech helpers', () => {
  it('records how the answer was given', () => {
    expect(inputMethodFor(false, false)).toBe('typed');
    expect(inputMethodFor(true, false)).toBe('typed');
    expect(inputMethodFor(false, true)).toBe('spoken');
    expect(inputMethodFor(true, true)).toBe('mixed');
  });

  it('appends spoken text with single spacing', () => {
    expect(appendSpokenText('', ' hello ')).toBe('hello');
    expect(appendSpokenText('I led', 'the team')).toBe('I led the team');
    expect(appendSpokenText('I led   ', 'the team')).toBe('I led the team');
    expect(appendSpokenText('I led', '   ')).toBe('I led');
  });

  it('reports no speech support outside a browser', () => {
    expect(recognitionCtor()).toBeNull();
  });
});
