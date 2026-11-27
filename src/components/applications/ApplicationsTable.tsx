'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardList, FileText, Loader2, Plus, Search } from 'lucide-react';
import { applicationStatuses, statusLabels, type ApplicationStatus } from '@/lib/applications/schema';
import type { ApplicationRow, CvOption } from '@/lib/applications/rows';
import { applyNudge, localDate } from '@/lib/applications/hygiene';
import type { ScreeningProfile } from '@/lib/applications/screening';
import { defaultView, nextSort, relativeTime, visibleRows, type SortKey, type ViewOptions } from '@/lib/applications/view';
import { ApplicationPanel, type PanelTarget } from './ApplicationPanel';
import { ScreeningAnswersSection } from './HygieneParts';

type Loaded = { applications: ApplicationRow[]; cvOptions: CvOption[]; unreadable: number };

async function fetchApplications(): Promise<Loaded> {
  const response = await fetch('/api/applications', { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Could not load your applications.');
  return body as Loaded;
}

const statusTone: Record<ApplicationStatus, string> = {
  preparing: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  applied: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  interviewing: 'bg-accent text-accent-foreground',
  offer: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  withdrawn: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  'no-response': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

const columns: { key: SortKey; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'updated', label: 'Updated' },
];

const fieldClass = 'rounded-lg border border-input bg-background px-3 py-2 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const SCREENING_LOAD_FAILED = 'Could not load your screening answers.';

async function fetchScreening(): Promise<ScreeningProfile> {
  const response = await fetch('/api/screening', { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || SCREENING_LOAD_FAILED);
  return body as ScreeningProfile;
}

export function ApplicationsTable() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewOptions>(defaultView);
  const [open, setOpen] = useState<PanelTarget | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [screening, setScreening] = useState<ScreeningProfile | null>(null);
  const [screeningError, setScreeningError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchScreening()
      .then(profile => { if (!cancelled) setScreening(profile); })
      .catch(e => { if (!cancelled) setScreeningError(e instanceof Error ? e.message : SCREENING_LOAD_FAILED); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchApplications()
      .then(loaded => { if (!cancelled) { setData(loaded); setError(''); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your applications.'); });
    return () => { cancelled = true; };
  }, [reloadTick]);

  const rows = useMemo(() => (data ? visibleRows(data.applications, view) : []), [data, view]);
  const reload = () => setReloadTick(t => t + 1);
  // Today in the user's local time, for the apply-early line.
  const today = localDate();

  return (
    <div className="mx-auto w-full max-w-6xl px-(--space-page-inline) py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-h2 text-foreground sm:text-h1">
            <ClipboardList className="size-7 text-primary" aria-hidden="true" /> Applications
          </h1>
          <p className="mt-1 text-small text-foreground-secondary">Every job you are pursuing, from CV Studio and elsewhere.</p>
        </div>
        <button type="button" disabled={!data} onClick={() => setOpen({ mode: 'new' })} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Plus className="size-4" aria-hidden="true" /> Log an outside application
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-small text-destructive">
          {error}
          <button type="button" onClick={reload} className="underline">Try again</button>
        </div>
      )}
      {data && data.unreadable > 0 && (
        <div role="status" className="mb-4 rounded-xl border border-primary/40 bg-accent p-4 text-small text-accent-foreground">
          {data.unreadable} tracker {data.unreadable === 1 ? 'entry' : 'entries'} could not be read and {data.unreadable === 1 ? 'is' : 'are'} hidden. Nothing was deleted.
        </div>
      )}
      {!data && !error && (
        <p className="flex items-center gap-2 text-small text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your applications…</p>
      )}

      {screening && <ScreeningAnswersSection profile={screening} onSaved={setScreening} />}
      {screeningError && <p role="alert" className="mb-4 text-small text-destructive">{screeningError}</p>}
      {data && data.applications.length === 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/80 p-10 text-center">
          <p className="font-medium text-foreground">No applications yet.</p>
          <p className="mt-2 text-small text-foreground-secondary">
            Prepare one in <Link href="/cv-studio" className="underline">CV Studio</Link>, or log a job you applied to elsewhere.
          </p>
        </div>
      )}

      {data && data.applications.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search applications</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={view.query} onChange={e => setView(v => ({ ...v, query: e.target.value }))} placeholder="Search company, role, contact or notes" className={`${fieldClass} w-full pl-9`} />
            </label>
            <label className="flex items-center gap-2 text-small">
              <span className="text-muted-foreground">Status</span>
              <select value={view.status} onChange={e => setView(v => ({ ...v, status: e.target.value as ViewOptions['status'] }))} className={fieldClass}>
                <option value="all">All</option>
                {applicationStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/80">
            <table className="w-full min-w-[640px] text-left text-small">
              <thead className="border-b border-border/60 text-label uppercase tracking-wide text-muted-foreground">
                <tr>
                  {columns.map(c => {
                    const active = view.sort === c.key;
                    const Icon = !active ? ArrowUpDown : view.direction === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <th key={c.key} scope="col" aria-sort={active ? (view.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => setView(v => nextSort(v, c.key))} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
                          {c.label}<Icon className="size-3" aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="px-4 py-3 font-medium">CV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const nudge = applyNudge(row.draft, today);
                  return (
                  <tr key={row.key} onClick={() => setOpen({ mode: 'row', row })} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <button type="button" onClick={e => { e.stopPropagation(); setOpen({ mode: 'row', row }); }} className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {row.draft.company || <span className="italic text-muted-foreground">Company not set</span>}
                      </button>
                      {nudge && <p className="mt-0.5 text-caption font-normal text-primary">{nudge}</p>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{row.draft.role}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium ${statusTone[row.draft.status]}`}>
                        {statusLabels[row.draft.status]}{row.virtual ? ' · from CV Studio' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{relativeTime(row.updatedAt)}</td>
                    <td className="px-4 py-3">
                      {row.workspaceId && (row.cvMissing
                        ? <span className="text-caption text-muted-foreground">CV deleted</span>
                        : <span className="inline-flex items-center gap-1 text-caption text-primary" title={row.cvName ?? undefined}><FileText className="size-3.5" aria-hidden="true" /> CV</span>)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className="p-6 text-center text-small text-foreground-secondary">No applications match your search.</p>}
          </div>
        </>
      )}

      {open && data && (
        <ApplicationPanel
          key={open.mode === 'new' ? 'new' : open.row.key}
          target={open}
          cvOptions={data.cvOptions}
          standardAnswers={screening?.answers ?? {}}
          onClose={() => { setOpen(null); reload(); }}
          onChanged={() => { setOpen(null); reload(); }}
        />
      )}
    </div>
  );
}
