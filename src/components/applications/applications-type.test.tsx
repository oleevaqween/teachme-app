import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { blankApplicationInput } from '@/lib/applications/schema';
import type { ApplicationRow } from '@/lib/applications/rows';

const at = new Date(2026, 10, 17, 12).toISOString();
const row = (key: string, status: 'applied' | 'interviewing', cv: boolean): ApplicationRow => ({
  key, entry: null, draft: blankApplicationInput({ company: `Co ${key}`, role: `Role ${key}`, status }),
  workspaceId: cv ? 'cv-1' : null, cvName: cv ? 'My CV' : null, cvMissing: false, virtual: true, updatedAt: at,
});
const loaded = { applications: [row('a', 'applied', true), row('b', 'interviewing', false)], cvOptions: [], unreadable: 0 };

// Effects do not run in static rendering, so the first state slot (the loaded data) is seeded and effects are skipped.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  let calls = 0;
  return {
    ...actual,
    useEffect: () => {},
    useState: (initial: unknown) => {
      const index = calls++ % 7;
      return index === 0 ? [loaded, () => {}] : actual.useState(initial);
    },
  };
});

import { ApplicationsTable } from './ApplicationsTable';

describe('applications table type scale', () => {
  const html = renderToStaticMarkup(<ApplicationsTable />);

  it('renders the rows', () => {
    expect(html).toContain('Co a');
    expect(html).toContain('Co b');
  });

  it('puts body cells on text-small and headers on text-label uppercase', () => {
    expect(html).toMatch(/<table[^>]*class="[^"]*\btext-small\b/);
    expect(html).toMatch(/<thead[^>]*class="[^"]*\btext-label\b[^"]*\buppercase\b/);
    expect(html).toMatch(/<tbody[\s\S]*<td[^>]*class="[^"]*px-4 py-3/);
  });

  it('keeps chips on text-caption and uses no amber classes', () => {
    expect(html).toMatch(/<span class="inline-flex whitespace-nowrap rounded-full[^"]*\btext-caption\b/);
    expect(html).not.toContain('amber-');
  });
});
