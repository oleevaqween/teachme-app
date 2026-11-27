'use client';
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyThemePreference, readThemePreference, writeThemePreference, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const CHANGE_EVENT = 'teachme-theme-change';
let chosen: ThemePreference | null = null;

function browserStorage() {
  try { return window.localStorage; } catch { return undefined; }
}
/** In-memory fallback for when localStorage is blocked; only called from the click handler. */
function rememberChoice(value: ThemePreference) {
  chosen = value;
}
function currentPreference(): ThemePreference {
  return chosen ?? readThemePreference(browserStorage());
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

const options = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'Match my computer', Icon: Monitor },
] as const;

/**
 * Where a key moves the choice in the radio group: Arrow Right/Down to the next option and Arrow Left/Up to the
 * previous (both wrap), Home and End to the first and last; null for any other key.
 */
export function themeKeyTarget(index: number, key: string, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Light / dark / system switch. The initial class comes from the inline script in the root
 * layout; this component only changes it when the user chooses or the system setting changes.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const preference = useSyncExternalStore(subscribe, currentPreference, () => 'system' as ThemePreference);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyThemePreference(currentPreference());
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function choose(value: ThemePreference) {
    rememberChoice(value);
    writeThemePreference(browserStorage(), value);
    applyThemePreference(value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  // A radio group is one tab stop; the arrow keys move and choose, as in any radio group.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = themeKeyTarget(index, event.key, options.length);
    if (target === null) return;
    event.preventDefault();
    choose(options[target].value);
    buttons.current[target]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn('inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5', className)}>
      {options.map(({ value, label, Icon }, index) => (
        <button
          key={value}
          ref={(element) => { buttons.current[index] = element; }}
          type="button"
          role="radio"
          aria-checked={preference === value}
          tabIndex={preference === value ? 0 : -1}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            preference === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
