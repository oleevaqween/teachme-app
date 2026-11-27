import { describe, expect, it } from 'vitest';
import type { ApplicationRow } from './rows';
import { blankApplicationInput, type ApplicationStatus } from './schema';
import { defaultView, nextSort, relativeTime, visibleRows } from './view';

const row = (key: string, company: string, role: string, status: ApplicationStatus, updatedAt: string, extra: Partial<ApplicationRow['draft']> = {}): ApplicationRow => ({
  key, entry: null, draft: blankApplicationInput({ company, role, status, ...extra }), workspaceId: null, cvName: null, cvMissing: false, virtual: false, updatedAt,
});
const rows = [
  row('a', 'Acme', 'Project Manager', 'interviewing', '2026-11-14T00:00:00.000Z', { notes: 'Panel with the CTO' }),
  row('b', 'globex', 'Delivery Lead', 'applied', '2026-11-10T00:00:00.000Z', { contact: { name: 'Ngozi Recruiter', email: '', phone: '', source: 'LinkedIn' } }),
  row('c', 'Initech', 'PMO Analyst', 'preparing', '2026-11-12T00:00:00.000Z'),
];
const keys = (list: ApplicationRow[]) => list.map(r => r.key);

describe('visibleRows', () => {
  it('defaults to most recently updated first', () => {
    expect(keys(visibleRows(rows, defaultView))).toEqual(['a', 'c', 'b']);
  });

  it('searches company, role, contact and notes case-insensitively', () => {
    expect(keys(visibleRows(rows, { ...defaultView, query: 'cto' }))).toEqual(['a']);
    expect(keys(visibleRows(rows, { ...defaultView, query: 'ngozi' }))).toEqual(['b']);
    expect(keys(visibleRows(rows, { ...defaultView, query: 'linkedin' }))).toEqual(['b']);
    expect(keys(visibleRows(rows, { ...defaultView, query: 'PMO' }))).toEqual(['c']);
  });

  it('filters by status', () => {
    expect(keys(visibleRows(rows, { ...defaultView, status: 'applied' }))).toEqual(['b']);
  });

  it('sorts company alphabetically ignoring case, and status in pipeline order', () => {
    expect(keys(visibleRows(rows, { ...defaultView, sort: 'company', direction: 'asc' }))).toEqual(['a', 'b', 'c']);
    expect(keys(visibleRows(rows, { ...defaultView, sort: 'status', direction: 'asc' }))).toEqual(['c', 'b', 'a']);
  });
});

describe('nextSort', () => {
  it('toggles direction on the same column and picks a sensible default for a new one', () => {
    expect(nextSort(defaultView, 'updated')).toMatchObject({ sort: 'updated', direction: 'asc' });
    expect(nextSort(defaultView, 'company')).toMatchObject({ sort: 'company', direction: 'asc' });
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  it('describes recent times briefly and older ones as a date', () => {
    expect(relativeTime('2026-11-15T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-11-15T11:15:00.000Z', now)).toBe('45m ago');
    expect(relativeTime('2026-11-15T07:00:00.000Z', now)).toBe('5h ago');
    expect(relativeTime('2026-11-13T12:00:00.000Z', now)).toBe('2d ago');
    expect(relativeTime('2026-11-01T12:00:00.000Z', now)).toBe('2w ago');
    expect(relativeTime('2026-08-01T12:00:00.000Z', now)).toBe('1 Aug 2026');
    expect(relativeTime('not a date', now)).toBe('');
  });
});

describe('relativeTime month names', () => {
  it('uses the fixed three-letter months, never "Sept"', () => {
    // Built from local parts so the day is the same in every time zone.
    const now = new Date(2026, 10, 15, 12);
    expect(relativeTime(new Date(2026, 8, 12, 12).toISOString(), now)).toBe('12 Sep 2026');
    expect(relativeTime(new Date(2026, 5, 3, 12).toISOString(), now)).toBe('3 Jun 2026');
  });
});
