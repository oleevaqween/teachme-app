import type { ApplicationRow } from './rows';
import { dayLabel } from './hygiene';
import { applicationStatuses, type ApplicationStatus } from './schema';

export type SortKey = 'company' | 'role' | 'status' | 'updated';
export type ViewOptions = { query: string; status: ApplicationStatus | 'all'; sort: SortKey; direction: 'asc' | 'desc' };

export const defaultView: ViewOptions = { query: '', status: 'all', sort: 'updated', direction: 'desc' };

const pipeline = Object.fromEntries(applicationStatuses.map((s, i) => [s, i])) as Record<ApplicationStatus, number>;

function searchText(row: ApplicationRow): string {
  const d = row.draft;
  return [d.company, d.role, d.location, d.contact.name, d.contact.email, d.contact.source, d.notes].join('\n').toLowerCase();
}

function compare(a: ApplicationRow, b: ApplicationRow, key: SortKey): number {
  switch (key) {
    case 'company': return a.draft.company.localeCompare(b.draft.company, undefined, { sensitivity: 'base' });
    case 'role': return a.draft.role.localeCompare(b.draft.role, undefined, { sensitivity: 'base' });
    case 'status': return pipeline[a.draft.status] - pipeline[b.draft.status];
    case 'updated': return a.updatedAt.localeCompare(b.updatedAt);
  }
}

export function visibleRows(rows: ApplicationRow[], view: ViewOptions): ApplicationRow[] {
  const query = view.query.trim().toLowerCase();
  const direction = view.direction === 'asc' ? 1 : -1;
  return rows
    .filter(row => (view.status === 'all' || row.draft.status === view.status) && (!query || searchText(row).includes(query)))
    .sort((a, b) => direction * compare(a, b, view.sort) || a.key.localeCompare(b.key));
}

/** Clicking the active column flips direction; a new column starts newest-first for dates, A to Z otherwise. */
export function nextSort(view: ViewOptions, key: SortKey): ViewOptions {
  if (view.sort === key) return { ...view, direction: view.direction === 'asc' ? 'desc' : 'asc' };
  return { ...view, sort: key, direction: key === 'updated' ? 'desc' : 'asc' };
}

export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const seconds = (now.getTime() - then.getTime()) / 1000;
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 35) return `${Math.floor(days / 7)}w ago`;
  // Fixed month names, as elsewhere in the tracker ("Sep", never "Sept").
  return dayLabel(iso);
}
