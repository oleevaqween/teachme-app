import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';

const SRC = join(process.cwd(), 'src');
const SELF = join(SRC, 'app', 'interview', 'retired-cv-screen.test.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// Loading next.config and reading every source file can pass 5 seconds when the full suite runs in parallel.
describe('retired /interview/cv screen', { timeout: 30_000 }, () => {
  it('sends the old address to CV Studio with a temporary redirect', async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toContainEqual({ source: '/interview/cv', destination: '/cv-studio', permanent: false });
  });

  it('leaves no link or request to the retired screen or its API anywhere in src', () => {
    const offenders = sourceFiles(SRC)
      .filter(file => file !== SELF && readFileSync(file, 'utf8').includes('/interview/cv'))
      .map(file => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
