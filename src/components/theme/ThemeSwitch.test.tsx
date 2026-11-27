import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeSwitch, themeKeyTarget } from './ThemeSwitch';

describe('themeKeyTarget (radio group keys)', () => {
  it('moves to the next option with ArrowRight or ArrowDown, wrapping at the end', () => {
    expect(themeKeyTarget(0, 'ArrowRight', 3)).toBe(1);
    expect(themeKeyTarget(1, 'ArrowDown', 3)).toBe(2);
    expect(themeKeyTarget(2, 'ArrowRight', 3)).toBe(0);
  });

  it('moves to the previous option with ArrowLeft or ArrowUp, wrapping at the start', () => {
    expect(themeKeyTarget(2, 'ArrowLeft', 3)).toBe(1);
    expect(themeKeyTarget(0, 'ArrowUp', 3)).toBe(2);
  });

  it('jumps to the first and last options with Home and End', () => {
    expect(themeKeyTarget(1, 'Home', 3)).toBe(0);
    expect(themeKeyTarget(0, 'End', 3)).toBe(2);
  });

  it('ignores other keys (Tab, Enter, letters)', () => {
    for (const key of ['Tab', 'Enter', ' ', 'a']) expect(themeKeyTarget(1, key, 3)).toBeNull();
  });
});

describe('ThemeSwitch markup', () => {
  it('is a radio group with one tab stop, on the chosen option (system before the browser reads a choice)', () => {
    const html = renderToStaticMarkup(<ThemeSwitch />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-checked="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-checked="true"/);
    expect(html).toContain('focus-visible:ring-2');
  });
});
