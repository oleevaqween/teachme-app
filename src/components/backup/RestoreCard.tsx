'use client';
import { useRef, useState } from 'react';
import { Loader2, RotateCcw, Search } from 'lucide-react';
import {
  backupDateLabel, kindLabels, MAX_FILE_BYTES, RELOAD_TABS, RESTORE_KINDS, SCREENING_LABEL, screeningOutcomeText, TOO_LARGE,
  type RestoreResultView, type RestoreView,
} from '@/lib/backup/restore-view';

const FAILED = 'The restore could not be completed. Please try again.';
const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

export function RestoreCheck({ view, busy, onRestore }: { view: RestoreView; busy: boolean; onRestore: () => void }) {
  return (
    <div className="mt-4 space-y-3 text-small">
      <p className="text-foreground">Backup from {backupDateLabel(view.exportedAt)}. Nothing already in the app will be changed or removed.</p>
      <table className="w-full text-left text-small">
        <thead className="text-caption text-muted-foreground">
          <tr><th>Item</th><th>In file</th><th>Will be added</th><th>Already here</th><th>Kept yours</th><th>Skipped</th></tr>
        </thead>
        <tbody>
          {RESTORE_KINDS.map(kind => {
            const s = view.summary[kind];
            return <tr key={kind}><th>{kindLabels[kind]}</th><td>{s.inFile}</td><td>{s.added}</td><td>{s.same}</td><td>{s.kept}</td><td>{s.skipped}</td></tr>;
          })}
        </tbody>
      </table>
      {view.screeningProfile && <p className="text-muted-foreground">{`${SCREENING_LABEL}: ${screeningOutcomeText[view.screeningProfile]}`}</p>}
      {view.kept.length > 0 && <div>
        <p className="font-medium text-foreground">Kept as the app has them</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          {view.kept.map((k, i) => <li key={i}>{k.name}: kept yours{k.versionCopy ? '; the backup copy will be saved as a version.' : '.'}</li>)}
        </ul>
      </div>}
      {view.skipped.length > 0 && <div>
        <p className="font-medium text-foreground">Skipped (still safe in your backup file)</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          {view.skipped.map((s, i) => <li key={i}>{s.name}: {s.reason}</li>)}
        </ul>
      </div>}
      {view.addCount === 0
        ? <p className="text-foreground-secondary">Nothing to add: everything in this file is already in the app.</p>
        : <button type="button" onClick={onRestore} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}Restore {items(view.addCount)}</button>}
    </div>
  );
}

export function RestoreDone({ result }: { result: RestoreResultView }) {
  return (
    <div role="status" className="mt-4 space-y-2 text-small">
      <p className="font-medium text-foreground">Restored {items(result.addCount)}.</p>
      <ul className="list-disc pl-5 text-muted-foreground">
        {RESTORE_KINDS.filter(kind => result.summary[kind].added > 0).map(kind => <li key={kind}>{kindLabels[kind]}: {result.summary[kind].added} added</li>)}
        {result.versionCopies > 0 && <li>{result.versionCopies} backup cop{result.versionCopies === 1 ? 'y' : 'ies'} saved as a version</li>}
        {result.screeningProfileAdded && <li>{`${SCREENING_LABEL}: added`}</li>}
      </ul>
      <p className="text-muted-foreground">{result.safetyCopy ? `Safety copy of your data before the restore: ${result.safetyCopy}` : 'No safety copy was needed: there was no career data yet.'}</p>
      <p className="text-muted-foreground">{RELOAD_TABS}</p>
    </div>
  );
}

export function RestoreCard() {
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<RestoreView | null>(null);
  const [result, setResult] = useState<RestoreResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef<boolean>(false);

  async function send(query: string): Promise<unknown> {
    const response = await fetch('/api/backup/restore' + query, { method: 'POST', body: file, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      // A changed app means the checked summary is out of date; the user checks again.
      if (response.status === 409) setView(null);
      throw new Error(body.error || FAILED);
    }
    return body;
  }

  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : FAILED); } finally { running.current = false; setBusy(false); }
  }

  const check = () => run(async () => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) throw new Error(TOO_LARGE);
    setResult(null);
    setView(await send('?action=check') as RestoreView);
  });
  const restore = () => run(async () => {
    if (!view) return;
    setResult(await send(`?action=restore&fingerprint=${view.fingerprint}`) as RestoreResultView);
    setView(null);
  });

  return (
    <section aria-labelledby="restore-title" className="mt-6 rounded-xl border border-border bg-card p-6">
      <h2 id="restore-title" className="text-lead leading-snug text-foreground">Restore from a backup</h2>
      <p className="mt-1 text-small text-foreground-secondary">
        Brings back CVs, saved versions, tracked applications and practice history from a backup file. Only what is missing is added; nothing already in the app is changed or removed, and a safety copy of your current data is made first.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="file" accept=".json,application/json" aria-label="Backup file" disabled={busy}
          onChange={e => { setFile(e.target.files?.[0] ?? null); setView(null); setResult(null); setError(''); }}
          className="text-small text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-small file:text-foreground" />
        <button type="button" onClick={() => void check()} disabled={busy || !file}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-small font-medium text-foreground hover:bg-accent disabled:opacity-50">
          {busy && !view ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}Check file</button>
      </div>
      {view && <RestoreCheck view={view} busy={busy} onRestore={() => void restore()} />}
      {result && <RestoreDone result={result} />}
      {error && <p role="alert" className="mt-3 text-small text-destructive">{error}</p>}
    </section>
  );
}
