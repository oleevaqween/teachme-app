'use client';
import { useRef } from 'react';
import { Check, Scissors, X } from 'lucide-react';
import { cutAdvice, cutSummary, type CutPlan } from '@/lib/cv-studio/condense';
import type { Workspace } from '@/lib/cv-studio/schema';

/** Shown on the "Your CV is long" finding: cuts are only offered on application CVs. */
export function CutAction({ kind, busy, onSuggest }: { kind: Workspace['kind']; busy: boolean; onSuggest: () => void }) {
  if (kind !== 'application') return <p className="studio-hint">Cuts are suggested on application CVs; your master CV keeps everything.</p>;
  return <button type="button" className="studio-button secondary" disabled={busy} onClick={onSuggest}><Scissors size={15} aria-hidden="true" /> Suggest cuts</button>;
}

/** The card whose heading takes focus after cards go: the next remaining card, else the previous one; null means the summary. */
export function cutFocusTarget(ids: readonly string[], removed: readonly string[]): string | null {
  const last = Math.max(...removed.map(id => ids.indexOf(id)));
  const after = ids.slice(last + 1).find(id => !removed.includes(id));
  const before = ids.slice(0, Math.max(last, 0)).reverse().find(id => !removed.includes(id));
  return after ?? before ?? null;
}

/** Proposed cuts to older roles; nothing is reworded, and each role is applied or dismissed on its own. */
export function CutPanel({ plan, busy, onApply, onDismiss, onApplyAll }: {
  plan: CutPlan; busy: boolean; onApply: (id: string) => void; onDismiss: (id: string) => void; onApplyAll: () => void;
}) {
  const advice = cutAdvice(plan);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const headings = useRef(new Map<string, HTMLHeadingElement>());
  // After cards go, focus moves to the next remaining card's heading, or the summary when none remain (always after Apply all).
  function moveFocusAfter(removed: string[]) {
    const next = cutFocusTarget(plan.proposals.map(p => p.id), removed);
    (next ? headings.current.get(next) : summaryRef.current)?.focus();
  }
  return <section className="cut-panel" aria-label="Suggested cuts">
    <p ref={summaryRef} tabIndex={-1} aria-live="polite"><strong>{cutSummary(plan)}</strong></p>
    {advice && <p className="studio-hint">{advice}</p>}
    {plan.proposals.map(p => <article key={p.id} className="cut-proposal">
      <h4 tabIndex={-1} ref={el => { if (el) headings.current.set(p.id, el); else headings.current.delete(p.id); }}>{p.label} <small>{p.dates}</small></h4>
      {p.kept.length
        ? <ul aria-label={'Kept in ' + p.label}>{p.kept.map((b, i) => <li key={i}>{b}</li>)}</ul>
        : <p className="studio-hint">Keeps the title, organisation and dates only.</p>}
      <ul aria-label={'Removed from ' + p.label}>{p.removed.map((b, i) => <li key={i}><del>{b}</del></li>)}</ul>
      <div className="improve-actions">
        <button type="button" className="studio-button" disabled={busy} aria-label={'Apply cuts to ' + p.label} onClick={() => { moveFocusAfter([p.id]); onApply(p.id); }}><Check size={15} aria-hidden="true" /> Apply</button>
        <button type="button" className="studio-button secondary" disabled={busy} aria-label={'Dismiss cuts to ' + p.label} onClick={() => { moveFocusAfter([p.id]); onDismiss(p.id); }}><X size={15} aria-hidden="true" /> Dismiss</button>
      </div>
    </article>)}
    {plan.proposals.length > 1 && <button type="button" className="studio-button" disabled={busy} onClick={() => { moveFocusAfter(plan.proposals.map(p => p.id)); onApplyAll(); }}>Apply all</button>}
  </section>;
}
