'use client';
import { Loader2, Sparkles } from 'lucide-react';
import { MAX_EXTRA_QUESTIONS } from '@/lib/practice/schema';
import type { SessionQuestion } from '@/lib/practice/session';

export function QuestionList({ questions, selectedKey, onSelect, onGenerate, canGenerate, capReached, generating, disabled, emptyHint }: {
  questions: SessionQuestion[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onGenerate: () => void;
  canGenerate: boolean;
  capReached: boolean;
  generating: boolean;
  disabled: boolean;
  emptyHint?: string;
}) {
  const generateButton = (label: string) => (
    <button type="button" onClick={onGenerate} disabled={disabled || generating} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-small font-medium text-primary hover:bg-accent disabled:opacity-50">
      {generating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
      {generating ? 'Generating…' : label}
    </button>
  );

  if (questions.length === 0) {
    return (
      <nav aria-label="Questions" className="space-y-3 rounded-xl border border-border/60 bg-card/80 p-4 text-body">
        <p className="text-foreground">No questions yet for this CV.</p>
        {canGenerate
          ? generateButton('Generate questions')
          : <p className="text-small text-foreground-secondary">{emptyHint ?? 'Add the job posting in CV Studio, or prepare the application pack there, to get questions.'}</p>}
      </nav>
    );
  }

  return (
    <nav aria-label="Questions" className="space-y-3">
      <ol className="space-y-1">
        {questions.map((q, i) => {
          const active = q.key === selectedKey;
          return (
            <li key={q.key}>
              <button type="button" onClick={() => onSelect(q.key)} disabled={disabled} aria-current={active ? 'true' : undefined}
                className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-body lg:text-small transition-colors disabled:opacity-60 ${active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}>
                <span>
                  {i + 1}. {q.text}
                  {q.source === 'extra' && <span className="ml-1 text-caption text-muted-foreground">(extra)</span>}
                  {q.source === 'claim' && <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-caption text-accent-foreground">Claim</span>}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                  {q.progress.latest !== null ? `${q.progress.latest}/10` : 'Not practised'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {canGenerate && generateButton('More questions')}
      {capReached && <p role="note" className="text-small text-muted-foreground">You have reached the maximum of {MAX_EXTRA_QUESTIONS} extra questions for this application.</p>}
    </nav>
  );
}
