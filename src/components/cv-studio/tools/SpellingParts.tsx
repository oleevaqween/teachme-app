'use client';
import { ArrowRight, X } from 'lucide-react';
import type { CheckFinding, CheckTarget, SpellingOutcome } from '@/lib/cv-studio/cv-checker';
import type { ProofreadSuggestion } from '@/lib/cv-studio/proofread';

type Variant = 'en-GB' | 'en-US';

export function SpellingVariantSwitch({ value, onChange, disabled }: { value: Variant; onChange: (variant: Variant) => void; disabled?: boolean }) {
  return <fieldset className="spelling-variant" disabled={disabled}>
    <legend>Spelling</legend>
    {(['en-GB', 'en-US'] as const).map(v => <label key={v}>
      <input type="radio" name="spelling-variant" value={v} checked={value === v} onChange={() => onChange(v)} /> {v === 'en-GB' ? 'British English' : 'American English'}
    </label>)}
  </fieldset>;
}

export function SpellingStatus({ status }: { status: SpellingOutcome['status'] }) {
  if (status === 'pending') return <p className="studio-hint" role="status">Checking spelling…</p>;
  if (status === 'failed') return <p className="studio-hint" role="status">Spelling could not be checked. Your score isn&apos;t affected; it will try again when you edit.</p>;
  return null;
}

export function SpellingWords({ finding, onGo, onAdd, disabled }: { finding: CheckFinding; onGo: (target: CheckTarget) => void; onAdd?: (word: string) => void; disabled?: boolean }) {
  if (!finding.words?.length) return null;
  return <ul className="spelling-words">
    {finding.words.map(w => <li key={w.word}>
      <strong>{w.word}</strong>
      <span>{w.suggestions.length ? '→ ' + w.suggestions.join(', ') : 'no suggestions'}</span>
      <span className="spelling-where">{w.where}</span>
      <button type="button" className="text-button" aria-label={`Go to ${w.where}`} onClick={() => onGo(w.target)}>Go to <ArrowRight size={14} aria-hidden="true" /></button>
      {onAdd && <button type="button" className="text-button" aria-label={`Add ${w.word} to my words`} disabled={disabled} onClick={() => onAdd(w.word)}>Add to my words</button>}
    </li>)}
  </ul>;
}

export function ProofreadResults({ ran, suggestions, dropped, busy, onApply, onDismiss }: {
  ran: boolean; suggestions: ProofreadSuggestion[]; dropped: number; busy: boolean; onApply: (s: ProofreadSuggestion) => void; onDismiss: (s: ProofreadSuggestion) => void;
}) {
  if (!ran) return null;
  return <div className="proofread-results" aria-live="polite">
    {dropped > 0 && <p className="studio-hint">{dropped === 1 ? '1 suggestion was' : `${dropped} suggestions were`} left out because they changed facts or broke your writing rules.</p>}
    {!suggestions.length && <p className="studio-hint">No fixes suggested.</p>}
    {suggestions.map(s => <div key={s.id} className="finding info proofread-card">
      <strong>{s.label}</strong>
      <div className="proofread-change">
        <div><span className="studio-step">NOW</span><p>{s.before}</p></div>
        <div><span className="studio-step">FIX</span><p>{s.after}</p></div>
      </div>
      {s.reason && <p>{s.reason}</p>}
      <div className="proofread-actions">
        <button type="button" className="studio-button secondary" aria-label={`Apply fix to ${s.label}`} disabled={busy} onClick={() => onApply(s)}>Apply</button>
        <button type="button" className="text-button" aria-label={`Dismiss fix to ${s.label}`} disabled={busy} onClick={() => onDismiss(s)}>Dismiss</button>
      </div>
    </div>)}
  </div>;
}

export function OwnWords({ words, onRemove, disabled }: { words: string[]; onRemove: (word: string) => void; disabled?: boolean }) {
  if (!words.length) return null;
  return <details className="own-words">
    <summary>My words ({words.length})</summary>
    <p className="studio-hint">The spelling check accepts these words in this CV and in applications you make from it.</p>
    <ul>{words.map(w => <li key={w}>{w}<button type="button" className="text-button" aria-label={`Remove ${w} from my words`} disabled={disabled} onClick={() => onRemove(w)}><X size={12} aria-hidden="true" /></button></li>)}</ul>
  </details>;
}
