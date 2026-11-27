'use client';
import { formatElapsed } from '@/components/cv-studio/WorkingBanner';
import { starParts, type FeedbackView, type StarPart, type StarRating } from '@/lib/practice/schema';

const partLabels: Record<StarPart, string> = { situation: 'Situation', task: 'Task', action: 'Action', result: 'Result' };
const ratingStyle: Record<StarRating, { icon: string; label: string; className: string }> = {
  strong: { icon: '✔', label: 'Strong', className: 'text-emerald-700 dark:text-emerald-400' },
  weak: { icon: '◐', label: 'Weak', className: 'text-primary' },
  missing: { icon: '✘', label: 'Missing', className: 'text-rose-700 dark:text-rose-400' },
};
const methodLabels = { typed: 'typed', spoken: 'spoken', mixed: 'typed and spoken' } as const;

export function FeedbackCard({ attempt, sectionRef, onTryAgain, onFollowUp, onNext }: {
  attempt: FeedbackView;
  sectionRef?: (element: HTMLElement | null) => void;
  onTryAgain?: () => void;
  onFollowUp?: () => void;
  onNext?: () => void;
}) {
  return (
    <section ref={sectionRef} tabIndex={-1} aria-label="Feedback" className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {attempt.followUpOf && <p className="text-body text-foreground"><span className="font-semibold">Follow-up:</span> {attempt.questionText}</p>}
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-lead leading-snug text-foreground">{attempt.followUpOf ? 'Feedback on your follow-up answer' : 'Feedback'}</h3>
        <p className="whitespace-nowrap text-h1 font-bold text-foreground">{attempt.score}<span className="text-lead font-medium text-muted-foreground">/10</span></p>
      </div>
      <details className="text-body">
        <summary className="cursor-pointer text-muted-foreground">Your answer ({formatElapsed(attempt.durationSeconds)}, {methodLabels[attempt.inputMethod]})</summary>
        <p className="mt-2 whitespace-pre-wrap text-foreground">{attempt.answer}</p>
      </details>
      <dl className="grid gap-2 text-body sm:grid-cols-[7rem_1fr]">
        {starParts.map(part => {
          const value = attempt.star[part];
          const style = ratingStyle[value.rating];
          return (
            <div key={part} className="contents">
              <dt className="font-medium text-foreground">{partLabels[part]}</dt>
              <dd className={style.className}>{style.icon} {style.label}{value.note ? `: ${value.note}` : ''}</dd>
            </div>
          );
        })}
      </dl>
      <div>
        <h4 className="text-body font-semibold text-foreground">Fix next time</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-body text-foreground">{attempt.fixes.map((fix, i) => <li key={i}>{fix}</li>)}</ul>
      </div>
      {attempt.rewrite ? (
        <div>
          <h4 className="text-body font-semibold text-foreground">Stronger version (from your own facts)</h4>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-body text-foreground">{attempt.rewrite}</p>
        </div>
      ) : attempt.rewriteWithheld ? (
        <p role="note" className="rounded-lg bg-accent p-3 text-body text-accent-foreground">{attempt.rewriteWithheld}</p>
      ) : null}
      {attempt.followUpQuestion && (
        <p className="text-body text-foreground"><span className="font-semibold">Follow-up:</span> {attempt.followUpQuestion}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {onTryAgain && <button type="button" onClick={onTryAgain} className="rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90">Try again</button>}
        {attempt.followUpQuestion && onFollowUp && <button type="button" onClick={onFollowUp} className="rounded-lg border border-primary/40 px-4 py-2 text-small font-medium text-primary hover:bg-accent">Answer the follow-up</button>}
        {onNext && <button type="button" onClick={onNext} className="rounded-lg border border-border px-4 py-2 text-small hover:bg-muted">Next question</button>}
      </div>
    </section>
  );
}
