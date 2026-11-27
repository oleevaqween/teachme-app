import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('theme tokens', () => {
  it('declares the type scale the design approved, nothing under 12px', () => {
    const scale = {
      label: ['0.75rem', '1.4'],
      caption: ['0.8125rem', '1.5'],
      small: ['0.875rem', '1.6'],
      body: ['0.9375rem', '1.6'],
      lead: ['1.0625rem', '1.75'],
      h3: ['1.25rem', '1.3'],
      h2: ['1.75rem', '1.25'],
      h1: ['2.25rem', '1.2'],
      display: ['3.5rem', '1'],
    };
    for (const [name, [size, line]] of Object.entries(scale)) {
      expect(css).toContain(`--text-${name}: ${size};`);
      expect(css).toContain(`--text-${name}--line-height: ${line};`);
    }
    expect(css).toContain('@theme static {');
  });

  it('declares the spacing tokens with smaller values on narrow screens', () => {
    for (const decl of [
      '--space-page-block: 2rem;',
      '--space-page-inline: 3rem;',
      '--space-columns: 1.75rem;',
      '--space-panel-block: 2.25rem;',
      '--space-panel-inline: 2.75rem;',
      '--space-card: 1.5rem;',
      '--space-stack: 0.75rem;',
      '--space-section: 2rem;',
    ]) {
      expect(css).toContain(decl);
    }
    expect(css).toMatch(/@media \(max-width: 1050px\)[\s\S]*?--space-page-inline: 1\.5rem;/);
    expect(css).toMatch(/@media \(max-width: 780px\)[\s\S]*?--space-page-inline: 1rem;/);
  });

  it('has a laptop spacing tier at 1400px', () => {
    expect(css).toMatch(
      /@media \(max-width: 1400px\) \{\s*:root \{\s*--space-page-inline: 2rem;\s*--space-panel-inline: 2rem;\s*--space-columns: 1\.5rem;\s*\}\s*\}/,
    );
    expect(css.indexOf('@media (max-width: 1400px)')).toBeLessThan(css.indexOf('@media (max-width: 1050px)'));
  });

  it('has a readable secondary text colour usable from Tailwind', () => {
    expect(css).toContain(
      '--foreground-secondary: color-mix(in oklch, var(--foreground) 72%, var(--background));',
    );
    expect(css).toContain('--color-foreground-secondary: var(--foreground-secondary);');
  });

  it('styles app headings with the heading font but never headings inside the CV paper or template thumbnails', () => {
    expect(css).toMatch(
      /:is\(h1, h2, h3\):not\(:where\(\.cv-paper, \.template-thumbnail\) \*\) \{\s*font-family: var\(--font-heading\), serif;\s*font-weight: 500;\s*letter-spacing: -0\.01em;\s*\}/,
    );
    expect(css).not.toMatch(/^\s*h1, h2, h3 \{/m);
  });

  it('uses the deeper gold in light and keeps the dark gold', () => {
    const light = css.match(/:root \{[^}]*?--primary: ([^;]+);/);
    const dark = css.match(/\.dark \{[^}]*?--primary: ([^;]+);/);
    expect(light?.[1]).toBe('oklch(0.52 0.14 70)');
    expect(dark?.[1]).toBe('oklch(0.75 0.14 75)');
  });
});
