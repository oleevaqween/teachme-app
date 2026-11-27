'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Loader2 } from 'lucide-react';
import { sentView } from '@/lib/applications/hygiene';
import type { Sent } from '@/lib/applications/schema';
import {
  HONESTY_NOTE, MAX_ANSWER, orderedQuestions, QUESTION_IDS, SCREENING_QUESTIONS, SCREENING_UNREADABLE,
  type QuestionId, type ScreeningAnswers, type ScreeningProfile,
} from '@/lib/applications/screening';
import type { Market } from '@/lib/cv-studio/schema';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const linkClass = 'inline-flex items-center gap-1 text-caption font-medium text-primary underline disabled:opacity-50';
const SAVE_FAILED = 'Your answers could not be saved.';

/** What was sent: the CV Studio downloads recorded for this application, with a way to record the latest. */
export function SentRecord({ workspaceId, sent, openHref, busy, onRefresh }: {
  workspaceId: string | null;
  sent: Sent | undefined;
  openHref?: string;
  busy: boolean;
  onRefresh: () => void;
}) {
  const { line, message } = sentView(workspaceId, sent);
  const button = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  // The fieldset disables while busy and drops focus, so once this button's request has finished (success or error) focus returns to it.
  useEffect(() => {
    if (!busy && asked.current) {
      asked.current = false;
      button.current?.focus();
    }
  }, [busy]);
  return (
    <section aria-label="What you sent" className="space-y-2 rounded-lg border border-border/60 p-3 text-small">
      <div aria-live="polite" className="space-y-2">
        {line && <p className="text-foreground">{line}</p>}
        {message && <p className="text-muted-foreground">{message}</p>}
      </div>
      {workspaceId && (
        <div className="flex flex-wrap items-center gap-3">
          {openHref && (
            <Link href={openHref} className={linkClass}><FileText className="size-3" aria-hidden="true" /> Open in CV Studio</Link>
          )}
          <button ref={button} type="button" disabled={busy} aria-busy={busy} onClick={() => { asked.current = true; onRefresh(); }} className={linkClass}>
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <Download className="size-3" aria-hidden="true" />} Use my latest download
          </button>
        </div>
      )}
    </section>
  );
}

/** This job's checklist: standard answers prefilled; an edit here is an override for this job only. TeachMe never fills answers in. */
export function ScreeningChecklist({ market, standard, overrides, onChange }: {
  market?: Market | null;
  standard: ScreeningAnswers;
  overrides: ScreeningAnswers | undefined;
  onChange: (next: ScreeningAnswers | undefined) => void;
}) {
  const set = (id: QuestionId, value: string) => onChange({ ...overrides, [id]: value });
  const reset = (id: QuestionId) => {
    const rest: ScreeningAnswers = { ...overrides };
    delete rest[id];
    onChange(Object.keys(rest).length ? rest : undefined);
  };
  return (
    <section aria-labelledby="screening-checklist-title" className="space-y-3 rounded-lg border border-border/60 p-3">
      <h3 id="screening-checklist-title" className="text-lead leading-snug text-foreground">Screening answers</h3>
      <p className="text-small text-foreground-secondary">{HONESTY_NOTE}</p>
      {orderedQuestions(market).map(id => {
        const own = overrides?.[id];
        return (
          <div key={id} className="space-y-1">
            <label htmlFor={`screening-${id}`} className="block text-small font-medium text-muted-foreground">{SCREENING_QUESTIONS[id]}</label>
            <textarea id={`screening-${id}`} className={inputClass} rows={2} maxLength={MAX_ANSWER} value={own ?? standard[id] ?? ''} onChange={e => set(id, e.target.value)} />
            {own !== undefined && <button type="button" onClick={() => reset(id)} className={linkClass}>Use my standard answer</button>}
          </div>
        );
      })}
    </section>
  );
}

/** The user's standard answers, saved once and used to prefill every application's checklist. Collapsed by default. */
export function ScreeningAnswersSection({ profile, onSaved }: { profile: ScreeningProfile; onSaved: (profile: ScreeningProfile) => void }) {
  const [answers, setAnswers] = useState<ScreeningAnswers>(profile.answers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/screening', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, revision: profile.revision }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || SAVE_FAILED);
      onSaved(body as ScreeningProfile);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mb-6 rounded-xl border border-border/60 bg-card/80 p-4">
      <summary className="cursor-pointer text-lead leading-snug text-foreground">Screening answers</summary>
      <div className="mt-3 space-y-3">
        {profile.unreadable && <p role="status" className="rounded-lg border border-primary/40 bg-accent p-3 text-small text-accent-foreground">{SCREENING_UNREADABLE}</p>}
        <p className="text-small text-foreground-secondary">{HONESTY_NOTE}</p>
        {QUESTION_IDS.map(id => (
          <div key={id} className="space-y-1">
            <label htmlFor={`screening-standard-${id}`} className="block text-small font-medium text-muted-foreground">{SCREENING_QUESTIONS[id]}</label>
            <textarea id={`screening-standard-${id}`} className={inputClass} rows={2} maxLength={MAX_ANSWER} value={answers[id] ?? ''}
              onChange={e => { const value = e.target.value; setSaved(false); setAnswers(a => ({ ...a, [id]: value })); }} />
          </div>
        ))}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-small text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Save answers
          </button>
          {saved && <span role="status" className="text-caption text-muted-foreground">Saved.</span>}
        </div>
      </div>
    </details>
  );
}
