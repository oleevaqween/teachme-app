export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_KEY = 'teachme-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
}

export function readThemePreference(storage: StorageLike | undefined): ThemePreference {
  try { return parseThemePreference(storage?.getItem(THEME_KEY) ?? null); } catch { return 'system'; }
}

export function writeThemePreference(storage: StorageLike | undefined, preference: ThemePreference): void {
  try { storage?.setItem(THEME_KEY, preference); } catch { /* Storage may be blocked; the theme still applies until reload. */ }
}

/** Puts the resolved theme on <html>; browser only. */
export function applyThemePreference(preference: ThemePreference): void {
  const dark = resolveTheme(preference, window.matchMedia(DARK_QUERY).matches) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
}

/** Inlined in the root layout's <head>: runs before first paint so a dark preference never flashes light. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p!=='light'&&window.matchMedia('${DARK_QUERY}').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;
