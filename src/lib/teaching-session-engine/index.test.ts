import { describe, it, expect } from 'vitest';
import { detectMessageIntent } from './intent-detector';

describe('message type tagging logic', () => {
  it('tags "continue" as lecture', () => {
    expect(detectMessageIntent('continue')).toBe('lecture');
  });

  it('initial message type is always lecture', () => {
    const INITIAL_MESSAGE_TYPE = 'lecture' as const;
    expect(INITIAL_MESSAGE_TYPE).toBe('lecture');
  });

  it('tags a genuine question as qa', () => {
    expect(detectMessageIntent('can you explain stakeholder salience models?')).toBe('qa');
  });

  it('tags "what\'s next" as lecture', () => {
    expect(detectMessageIntent("what's next")).toBe('lecture');
  });

  it('tags "thank you" as lecture', () => {
    expect(detectMessageIntent('thank you')).toBe('lecture');
  });

  it('tags an elaboration question as qa', () => {
    expect(detectMessageIntent('how does the influence grid differ from the power interest matrix?')).toBe('qa');
  });
});
