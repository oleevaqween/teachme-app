import { describe, expect, it } from 'vitest';
import { parseThemePreference, readThemePreference, resolveTheme, THEME_INIT_SCRIPT, THEME_KEY, writeThemePreference } from './theme';

describe('theme preference', () => {
  it('resolves every preference against the system setting', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('defaults to system for missing, unknown or blocked storage', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('purple')).toBe('system');
    expect(readThemePreference(undefined)).toBe('system');
    expect(readThemePreference({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} })).toBe('system');
  });

  it('round-trips a preference', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    writeThemePreference(storage, 'dark');
    expect(data.get(THEME_KEY)).toBe('dark');
    expect(readThemePreference(storage)).toBe('dark');
    expect(() => writeThemePreference({ getItem: () => null, setItem: () => { throw new Error('blocked'); } }, 'light')).not.toThrow();
  });
});

describe('theme init script (runs before first paint)', () => {
  function run(stored: string | null, systemDark: boolean, storageThrows = false) {
    const classes = new Set<string>();
    const localStorage = { getItem: () => { if (storageThrows) throw new Error('blocked'); return stored; } };
    const window = { matchMedia: () => ({ matches: systemDark }) };
    const document = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
    new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(localStorage, window, document);
    return classes.has('dark');
  }

  it('adds the dark class only when the saved or system preference is dark', () => {
    expect(run('dark', false)).toBe(true);
    expect(run('light', true)).toBe(false);
    expect(run('system', true)).toBe(true);
    expect(run(null, true)).toBe(true);
    expect(run(null, false)).toBe(false);
  });

  it('never throws when storage is blocked', () => {
    expect(() => run(null, true, true)).not.toThrow();
  });
});
