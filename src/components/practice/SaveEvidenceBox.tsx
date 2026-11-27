'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MAX_ANSWER, MIN_ANSWER, type EvidenceNumber } from '@/lib/practice/schema';

const NUMBER_CHOICES: { value: EvidenceNumber; label: string }[] = [
  { value: 'exact', label: 'Exact' }, { value: 'approximate', label: 'Approximate' }, { value: 'none', label: 'No number' },
];

export type EvidenceResult = { saved: true; master: 'saved' | 'skipped' | 'none'; masterNote: string | null };

/** The confirmation shown after a successful save. */
export function savedMessage(result: EvidenceResult): string {
  return result.master === 'saved' ? 'Saved as evidence for this bullet, and on your master CV.' : 'Saved as evidence for this bullet.';
}

/** Saves the user's own answer (never the AI rewrite) as evidence for the defended bullet, behind a tick. */
export function SaveEvidenceBox({ initialAnswer, busy, disabled, onSave, result }: {
  initialAnswer: string; busy: boolean; disabled: boolean; result?: { message: string; error: boolean } | null;
  /** Resolves to true when the save succeeded. */
  onSave: (input: { answer: string; number: EvidenceNumber }) => Promise<boolean>;
}) {
  const [answer, setAnswer] = useState(initialAnswer);
  const [number, setNumber] = useState<EvidenceNumber>('none');
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState<{ answer: string; number: EvidenceNumber } | null>(null);
  const length = answer.trim().length;
  const alreadySaved = saved !== null && saved.answer === answer.trim() && saved.number === number;
  const ready = confirmed && !alreadySaved && length >= MIN_ANSWER && length <= MAX_ANSWER;
  return (
    <section aria-label="Save as evidence" className="space-y-3 rounded-2xl border border-border/60 bg-card/80 p-5">
      <h3 className="text-lead leading-snug text-foreground">Save as evidence</h3>
      <p className="text-small text-foreground-secondary">Keep your answer as evidence for this bullet. Improve my CV and the fact checks can then use it. Only your own words are saved; trim anything you would not stand behind.</p>
      <textarea aria-label="Your answer to save" rows={5} maxLength={MAX_ANSWER} value={answer} disabled={disabled} onChange={e => setAnswer(e.target.value)}
        className="w-full rounded-lg border border-border bg-background p-3 text-body text-foreground" />
      {length < MIN_ANSWER && <small className="block text-small text-muted-foreground">Write at least 20 characters to save.</small>}
      <div role="radiogroup" aria-label="Is there a number in your answer?" className="flex flex-wrap gap-4 text-body text-foreground">
        {NUMBER_CHOICES.map(choice => (
          <label key={choice.value} className="inline-flex items-center gap-1.5">
            <input type="radio" name="evidence-number" checked={number === choice.value} disabled={disabled} onChange={() => setNumber(choice.value)} /> {choice.label}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-body text-foreground">
        <input type="checkbox" checked={confirmed} disabled={disabled} onChange={e => setConfirmed(e.target.checked)} />
        This is true and I can back it up
      </label>
      {result && (result.error
        ? <p role="alert" className="text-small text-destructive">{result.message}</p>
        : (saved === null || alreadySaved) && <p role="status" className="text-body text-foreground">{result.message}</p>)}
      <button type="button" disabled={disabled || !ready} onClick={async () => {
        const input = { answer: answer.trim(), number };
        if (await onSave(input)) setSaved(input);
      }}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{alreadySaved ? 'Saved' : 'Save as evidence'}
      </button>
    </section>
  );
}
