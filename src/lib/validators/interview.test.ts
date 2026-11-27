import { describe, it, expect } from 'vitest';
import { validateRole } from './interview';

describe('validateRole', () => {
  it('accepts a valid role', () => {
    expect(validateRole('Frontend Developer')).toEqual({ valid: true });
  });

  it('accepts a role at exactly 2 characters', () => {
    expect(validateRole('QA')).toEqual({ valid: true });
  });

  it('accepts a role at exactly 100 characters', () => {
    const role = 'a'.repeat(100);
    expect(validateRole(role)).toEqual({ valid: true });
  });

  it('rejects a role shorter than 2 chars', () => {
    const result = validateRole('X');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 2 characters');
  });

  it('rejects an empty role', () => {
    const result = validateRole('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 2 characters');
  });

  it('rejects a role longer than 100 chars', () => {
    const role = 'a'.repeat(101);
    const result = validateRole(role);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 100 characters');
  });

  it('trims input before validating', () => {
    // '  QA  ' has trimmed length 2 → valid
    expect(validateRole('  QA  ')).toEqual({ valid: true });
  });

  it('rejects whitespace-only input', () => {
    const result = validateRole('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 2 characters');
  });
});
