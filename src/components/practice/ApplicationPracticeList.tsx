'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2 } from 'lucide-react';

export type PracticeSummaryRow = { workspaceId: string; kind: 'master' | 'application'; name: string; role: string; company: string; practised: number; total: number; average: number | null };

export function ApplicationPracticeList() {
  const [summaries, setSummaries] = useState<PracticeSummaryRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/practice?summary=1', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load your CVs.');
        return body.summaries as PracticeSummaryRow[];
      })
      .then(list => { if (!cancelled) setSummaries(list); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your CVs.'); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p role="alert" className="text-small text-destructive">{error}</p>;
  if (!summaries) return <p className="flex items-center gap-2 text-small text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your CVs…</p>;
  if (!summaries.length) {
    return <p className="rounded-xl border border-border/60 bg-card/80 p-4 text-small text-foreground-secondary">No CVs yet. Create one in <Link href="/cv-studio" className="underline">CV Studio</Link> to practise questions built from the job posting and your CV.</p>;
  }
  return (
    <ul className="space-y-2">
      {summaries.map(s => (
        <li key={s.workspaceId}>
          <PracticeRow s={s} />
        </li>
      ))}
    </ul>
  );
}

export function PracticeRow({ s }: { s: PracticeSummaryRow }) {
  return (
    <Link href={`/interview/practice/${encodeURIComponent(s.workspaceId)}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/80 px-4 py-3 text-body shadow-sm transition-colors hover:border-primary/40">
      <span>
        <span className="font-medium text-foreground">{s.kind === 'master' ? 'Master CV · ' : ''}{s.role}{s.company ? ` · ${s.company}` : ''}</span>
        <span className="block text-caption text-muted-foreground">
          {s.total ? `${s.practised} of ${s.total} practised${s.average !== null ? ` · average ${s.average}/10` : ''}` : s.kind === 'master' ? 'Defend your CV bullets: start from Improve my CV in CV Studio' : 'No questions yet'}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
