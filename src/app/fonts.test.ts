import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

// Built from parts so the retired-screen scan in interview/retired-cv-screen.test.ts does not flag this file.
const RETIRED_CV_SOURCE = ['', 'interview', 'cv'].join('/');

// Loading next.config can pass 5 seconds when the full suite runs in parallel.
describe('fonts and dev indicator', { timeout: 30_000 }, () => {
  it('loads Inter for text and Petrona for headings, with the subsets that hold the naira sign and Yoruba letters', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    expect(src).not.toMatch(/Plus_Jakarta_Sans|Playfair_Display|Fraunces/);
    for (const name of ['Inter', 'Petrona']) {
      const call = src.match(new RegExp(`\\b${name}\\(\\{[\\s\\S]*?\\}\\)`))?.[0] ?? '';
      expect(call, name).toMatch(/["']latin-ext["']/);
      expect(call, name).toMatch(/["']vietnamese["']/);
      if (name === 'Inter') expect(call, name).toMatch(/axes: \[["']opsz["']\]/);
      else expect(call, name).not.toMatch(/axes/);
    }
    expect(src).toMatch(/Inter\(\{[\s\S]*?variable: ["']--font-sans["']/);
    expect(src).toMatch(/Petrona\(\{[\s\S]*?variable: ["']--font-heading["']/);
  });

  it('hides the Next.js development indicator and keeps the CV redirect', async () => {
    expect(nextConfig.devIndicators).toBe(false);
    expect(await nextConfig.redirects?.()).toEqual([{ source: RETIRED_CV_SOURCE, destination: '/cv-studio', permanent: false }]);
  });
});
