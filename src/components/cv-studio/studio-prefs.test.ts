import { describe, expect, it } from 'vitest';
import { parseFlag, readFlag, readText, writeFlag, writeText } from './studio-prefs';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, data };
}
const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('remembered interface switches', () => {
  it('parses only "true" and "false"', () => {
    expect(parseFlag('true')).toBe(true);
    expect(parseFlag('false')).toBe(false);
    expect(parseFlag(null)).toBeNull();
    expect(parseFlag('yes')).toBeNull();
  });

  it('round-trips a choice through storage', () => {
    const storage = memoryStorage();
    expect(readFlag(storage, 'k')).toBeNull();
    writeFlag(storage, 'k', true);
    expect(readFlag(storage, 'k')).toBe(true);
    writeFlag(storage, 'k', false);
    expect(readFlag(storage, 'k')).toBe(false);
  });

  it('treats blocked or missing storage as "no choice yet" and never throws', () => {
    expect(readFlag(throwing, 'k')).toBeNull();
    expect(readFlag(undefined, 'k')).toBeNull();
    expect(() => writeFlag(throwing, 'k', true)).not.toThrow();
    expect(() => writeFlag(undefined, 'k', true)).not.toThrow();
  });

  it('round-trips text and never throws when storage is blocked', () => {
    const storage = memoryStorage();
    expect(readText(storage, 'k')).toBeNull();
    writeText(storage, 'k', '{"x":1}');
    expect(readText(storage, 'k')).toBe('{"x":1}');
    expect(readText(throwing, 'k')).toBeNull();
    expect(readText(undefined, 'k')).toBeNull();
    expect(() => writeText(throwing, 'k', 'v')).not.toThrow();
  });
});
