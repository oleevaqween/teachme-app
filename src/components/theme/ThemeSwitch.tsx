'use client';
import { useEffect, useSyncExternalStore } from 'react';
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
 * Light / dark / system switch. The initial class comes from the inline script in the root
 * layout; this component only changes it when the user chooses or the system setting changes.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const preference = useSyncExternalStore(subscribe, currentPreference, () => 'system' as ThemePreference);

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

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn('inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5', className)}>
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors',
            preference === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
