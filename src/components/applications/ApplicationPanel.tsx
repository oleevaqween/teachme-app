'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, FileText, Loader2, MessageSquare, Trash2, X } from 'lucide-react';
import { applyNudge, localDate } from '@/lib/applications/hygiene';
import { applicationStatuses, blankApplicationInput, isWebLink, statusLabels, withWebScheme, type ApplicationInput, type SavedApplication } from '@/lib/applications/schema';
import type { ApplicationRow, CvOption } from '@/lib/applications/rows';
import type { ScreeningAnswers } from '@/lib/applications/screening';
import { ScreeningChecklist, SentRecord } from './HygieneParts';

export type PanelTarget = { mode: 'new' } | { mode: 'row'; row: ApplicationRow };

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const linkClass = 'inline-flex items-center gap-1 text-caption font-medium text-primary underline';
const SAVE_FAILED = 'The change could not be saved.';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-small font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-small text-muted-foreground">{hint}</span>}
    </label>
  );
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ApplicationPanel({ target, cvOptions, standardAnswers, onClose, onChanged }: {
  target: PanelTarget;
  cvOptions: CvOption[];
  /** The user's standard screening answers, used to prefill this job's checklist. */
  standardAnswers: ScreeningAnswers;
  onClose: () => void;
  onChanged: () => void;
}) {
  const row = target.mode === 'row' ? target.row : null;
  const initial = useMemo(() => (row ? row.draft : blankApplicationInput()), [row]);
  const [form, setForm] = useState<ApplicationInput>(initial);
  // The saved entry; "Use my latest download" replaces it so later saves use the new revision.
  const [entry, setEntry] = useState<SavedApplication | null>(row?.entry ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const panelRef = useRef<HTMLElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  const update = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) => setForm(f => ({ ...f, [key]: value }));
  const updateContact = (key: keyof ApplicationInput['contact'], value: string) => setForm(f => ({ ...f, contact: { ...f.contact, [key]: value } }));

  function close() {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  }

  // Move focus into the dialog on open; give it back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    companyRef.current?.focus();
    return () => opener?.focus();
  }, []);

  // Move focus to the safe choice when the delete confirmation appears.
  useEffect(() => {
    if (confirmDelete) keepRef.current?.focus();
  }, [confirmDelete]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.matches(':disabled'));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!(active instanceof Node) || !panel.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      if (dirty && !window.confirm('Discard your unsaved changes?')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onClose]);

  async function send(method: 'POST' | 'PUT' | 'DELETE', body: unknown) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/applications', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || SAVE_FAILED);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  /** Use my latest download: the panel stays open with the refreshed record and revision. */
  async function recordLatestDownload() {
    if (!entry) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/applications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: entry.id, revision: entry.revision }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || SAVE_FAILED);
      setEntry(data as SavedApplication);
    } catch (e) {
      setError(e instanceof Error ? e.message : SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  const save = () => (entry
    ? send('PUT', { id: entry.id, application: form, revision: entry.revision })
    : send('POST', { application: form }));
  const remove = () => entry && send('DELETE', { id: entry.id, revision: entry.revision });

  // The entry's saved CV link is not in cvOptions (it is already linked), so add it back with its name.
  const linkChoices = useMemo(() => {
    const choices = [...cvOptions];
    const savedId = row?.workspaceId;
    if (savedId && !choices.some(c => c.id === savedId)) {
      choices.unshift({ id: savedId, name: row?.cvMissing ? 'CV deleted' : row?.cvName ?? 'Linked CV' });
    }
    if (form.workspaceId && !choices.some(c => c.id === form.workspaceId)) {
      choices.unshift({ id: form.workspaceId, name: 'Linked CV' });
    }
    return choices;
  }, [cvOptions, form.workspaceId, row]);
  const canOpenCv = !!form.workspaceId && !(row?.cvMissing && row.workspaceId === form.workspaceId);
  const cvHref = form.workspaceId ? `/cv-studio?open=${encodeURIComponent(form.workspaceId)}` : '';

  const nudge = applyNudge(form, localDate());
  const showSent = !!entry && (entry.status !== 'preparing' || !!entry.sent);
  // The Sent record carries Open in CV Studio when it is about the CV currently chosen, so the link is not shown twice.
  const sentHasLink = showSent && canOpenCv && entry?.workspaceId === form.workspaceId;
  const market = form.workspaceId && form.workspaceId === row?.workspaceId ? row?.market : cvOptions.find(c => c.id === form.workspaceId)?.market;

  const history = entry ? [...entry.history].reverse() : [];
  const title = target.mode === 'new' ? 'Log an outside application' : row?.virtual ? 'Start tracking this application' : 'Application details';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={close}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-panel-title"
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-background p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="application-panel-title" className="text-h3 text-foreground">{title}</h2>
            {row?.virtual && <p className="mt-1 text-small text-foreground-secondary">From CV Studio. Nothing is saved to the tracker until you press Save.</p>}
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company *"><input ref={companyRef} className={inputClass} value={form.company} onChange={e => update('company', e.target.value)} required maxLength={300} /></Field>
              <Field label="Role *"><input className={inputClass} value={form.role} onChange={e => update('role', e.target.value)} required maxLength={300} /></Field>
            </div>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={e => update('status', e.target.value as ApplicationInput['status'])}>
                {applicationStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Posted on"><input type="date" className={inputClass} value={form.postedOn ?? ''} onChange={e => update('postedOn', e.target.value || undefined)} /></Field>
              <Field label="Closes on"><input type="date" className={inputClass} value={form.closesOn ?? ''} onChange={e => update('closesOn', e.target.value || undefined)} /></Field>
              <Field label="Applied on"><input type="date" className={inputClass} value={form.appliedOn ?? ''} onChange={e => update('appliedOn', e.target.value || undefined)} /></Field>
            </div>
            {nudge && (
              <p className="flex items-start gap-1.5 text-small text-primary">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{nudge}
              </p>
            )}
            <Field label="Job link" hint="Must start with http:// or https://">
              <input className={inputClass} type="url" inputMode="url" placeholder="https://" value={form.jobUrl} onChange={e => update('jobUrl', e.target.value)} onBlur={() => update('jobUrl', withWebScheme(form.jobUrl))} maxLength={2000} />
            </Field>
            {isWebLink(form.jobUrl) && (
              <a href={form.jobUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>Open job posting <ExternalLink className="size-3" aria-hidden="true" /></a>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location"><input className={inputClass} value={form.location} onChange={e => update('location', e.target.value)} maxLength={300} placeholder="e.g. Lagos / Remote" /></Field>
              <Field label="Salary"><input className={inputClass} value={form.salary} onChange={e => update('salary', e.target.value)} maxLength={300} /></Field>
            </div>
            <fieldset className="space-y-3 rounded-lg border border-border/60 p-3">
              <legend className="px-1 text-small font-medium text-muted-foreground">Contact</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><input className={inputClass} value={form.contact.name} onChange={e => updateContact('name', e.target.value)} maxLength={300} /></Field>
                <Field label="Email"><input className={inputClass} type="email" value={form.contact.email} onChange={e => updateContact('email', e.target.value)} maxLength={300} /></Field>
                <Field label="Phone"><input className={inputClass} type="tel" value={form.contact.phone} onChange={e => updateContact('phone', e.target.value)} maxLength={100} /></Field>
                <Field label="How you found it"><input className={inputClass} value={form.contact.source} onChange={e => updateContact('source', e.target.value)} maxLength={300} placeholder="LinkedIn, referral…" /></Field>
              </div>
            </fieldset>
            <Field label="Notes"><textarea className={inputClass} rows={5} value={form.notes} onChange={e => update('notes', e.target.value)} maxLength={12000} /></Field>
            <Field label="Linked CV">
              <select className={inputClass} value={form.workspaceId ?? ''} onChange={e => update('workspaceId', e.target.value || null)}>
                <option value="">None</option>
                {linkChoices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {canOpenCv && !sentHasLink && (
              <Link href={cvHref} className={linkClass}>
                <FileText className="size-3" aria-hidden="true" /> Open in CV Studio
              </Link>
            )}
            {canOpenCv && (
              <Link href={`/interview/practice/${encodeURIComponent(form.workspaceId!)}`} className={linkClass}>
                <MessageSquare className="size-3" aria-hidden="true" /> Practise interview
              </Link>
            )}
            {showSent && entry && (
              <SentRecord workspaceId={entry.workspaceId} sent={entry.sent} openHref={sentHasLink ? cvHref : undefined} busy={busy} onRefresh={recordLatestDownload} />
            )}
            <ScreeningChecklist market={market} standard={standardAnswers} overrides={form.screening} onChange={screening => update('screening', screening)} />
          </fieldset>

          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-small text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
            <button type="submit" disabled={busy || (!dirty && !!entry)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Save changes
            </button>
            {dirty && <span className="text-caption text-primary">Unsaved changes</span>}
            {entry && !confirmDelete && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto inline-flex items-center gap-1 text-small text-destructive hover:underline">
                <Trash2 className="size-4" aria-hidden="true" /> Delete entry
              </button>
            )}
          </div>
          {confirmDelete && (
            <div role="alertdialog" aria-label="Confirm delete" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-small">
              <p>This removes the tracker entry only. Your CV in CV Studio is not affected.</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg bg-destructive px-3 py-1.5 text-small font-medium text-white disabled:opacity-50">Delete entry</button>
                <button type="button" ref={keepRef} onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-3 py-1.5 text-small">Keep it</button>
              </div>
            </div>
          )}
        </form>

        {history.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 text-lead leading-snug text-foreground">Status history</h3>
            <ol className="space-y-1 text-caption text-muted-foreground">
              {history.map((h, i) => (
                <li key={i}>{h.from ? `${statusLabels[h.from]} → ${statusLabels[h.to]}` : `Created as ${statusLabels[h.to]}`} · {when(h.at)}</li>
              ))}
            </ol>
          </section>
        )}
      </aside>
    </div>
  );
}
