import { describe, expect, it } from 'vitest';
import { extraQuestionKey, packQuestionKey } from './question-key';

describe('packQuestionKey', () => {
  it('matches the FNV-1a 64 reference values', () => {
    expect(packQuestionKey('')).toBe('pack:cbf29ce484222325');
    expect(packQuestionKey('A')).toBe('pack:af63dc4c8601ec8c'); // normalised to "a"
  });

  it('gives the same key to wording that differs only in case, spacing or end punctuation', () => {
    const key = packQuestionKey('Tell me about a project you rescued?');
    expect(packQuestionKey('  tell me about a   project you rescued ')).toBe(key);
    expect(key).toMatch(/^pack:[0-9a-f]{16}$/);
  });

  it('gives different questions different keys', () => {
    expect(packQuestionKey('Why this company?')).not.toBe(packQuestionKey('Why this role?'));
  });
});

describe('extraQuestionKey', () => {
  it('prefixes the stored question id', () => {
    expect(extraQuestionKey('abc-123')).toBe('extra:abc-123');
  });
});
