import { describe, it, expect } from 'vitest';
import { validateTopic } from './topic';

describe('validateTopic', () => {
  it('accepts a topic within bounds (3-200 chars)', () => {
    expect(validateTopic('React Hooks')).toEqual({ valid: true });
  });

  it('accepts a topic at exactly 3 characters', () => {
    expect(validateTopic('abc')).toEqual({ valid: true });
  });

  it('accepts a topic at exactly 200 characters', () => {
    const topic = 'a'.repeat(200);
    expect(validateTopic(topic)).toEqual({ valid: true });
  });

  it('rejects an empty string', () => {
    const result = validateTopic('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3 characters');
  });

  it('rejects a topic shorter than 3 chars after trimming', () => {
    const result = validateTopic('  ab  ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3 characters');
  });

  it('rejects a topic longer than 200 chars', () => {
    const topic = 'a'.repeat(201);
    const result = validateTopic(topic);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 200 characters');
  });

  it('trims input before validating length', () => {
    // '   abc   ' has trimmed length 3 → valid
    expect(validateTopic('   abc   ')).toEqual({ valid: true });
  });

  it('rejects whitespace-only input', () => {
    const result = validateTopic('     ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3 characters');
  });
});
