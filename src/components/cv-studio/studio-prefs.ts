'use client';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

export const RAIL_COLLAPSED_KEY = 'teachme-cv-rail-collapsed';
export const PREVIEW_HIDDEN_KEY = 'teachme-cv-preview-hidden';
export const NARROW_QUERY = '(max-width: 1279px)';
/** Phone and small-tablet widths, where the preview always sits below the editor. */
export const SMALL_QUERY = '(max-width: 900px)';
const CHANGE_EVENT = 'teachme-pref-change';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** A stored "true" or "false"; anything else means the user has not chosen yet. */
export function parseFlag(raw: string | null): boolean | null {
  return raw === 'true' ? true : raw === 'false' ? false : null;
}

export function readFlag(storage: StorageLike | undefined, key: string): boolean | null {
  try { return parseFlag(storage?.getItem(key) ?? null); } catch { return null; }
}

export function writeFlag(storage: StorageLike | undefined, key: string, value: boolean): void {
  try { storage?.setItem(key, String(value)); } catch { /* Storage may be blocked; the in-memory choice still applies. */ }
}

/** A stored string, or null when nothing is stored or storage is blocked. */
export function readText(storage: StorageLike | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function writeText(storage: StorageLike | undefined, key: string, value: string): void {
  try { storage?.setItem(key, value); } catch { /* Storage may be blocked; the in-memory choice still applies. */ }
}

const memory = new Map<string, boolean>();
const textMemory = new Map<string, string>();

function browserStorage(): StorageLike | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/** A switch remembered in this browser: the user's choice, or `fallback` until they make one. */
export function useRememberedFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => (memory.has(key) ? memory.get(key)! : readFlag(browserStorage(), key)),
    () => null,
  );
  const set = useCallback((value: boolean) => {
    memory.set(key, value);
    writeFlag(browserStorage(), key, value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [key]);
  return [stored ?? fallback, set];
}

/** A value remembered in this browser as text; null until one is saved. Callers parse it. */
export function useRememberedText(key: string): [string | null, (value: string) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => (textMemory.has(key) ? textMemory.get(key)! : readText(browserStorage(), key)),
    () => null,
  );
  const set = useCallback((value: string) => {
    textMemory.set(key, value);
    writeText(browserStorage(), key, value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [key]);
  return [stored, set];
}

/** Whether a CSS media query matches; false while rendering on the server. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    callback => {
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      return () => list.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on laptop-width or narrower windows; false while rendering on the server. */
export function useNarrowScreen(): boolean {
  return useMediaQuery(NARROW_QUERY);
}

function subscribeResize(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

/** The browser window's size, or null while rendering on the server. */
export function useViewport(): { width: number; height: number } | null {
  const size = useSyncExternalStore(subscribeResize, () => `${window.innerWidth}x${window.innerHeight}`, () => null);
  return useMemo(() => {
    if (!size) return null;
    const [width, height] = size.split('x').map(Number);
    return { width, height };
  }, [size]);
}
