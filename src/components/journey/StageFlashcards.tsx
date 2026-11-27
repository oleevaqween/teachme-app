'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FLASHCARDS_UNAVAILABLE_MESSAGE,
  MAX_BACK_LENGTH,
  MAX_FRONT_LENGTH,
  dueCards,
  type CardView,
  type ReviewResult,
} from '@/lib/teaching-session-engine/flashcards';
import type { CardDraft, FlashcardsBusy, FlashcardsStatus } from './use-stage-flashcards';

type Answer = { ok: true } | { ok: false; error: string };

export type StageFlashcardsProps = {
  cards: CardView[];
  status: FlashcardsStatus;
  /** The action the hook is saving; buttons stay disabled while it runs, also after the popup is reopened. */
  busy?: FlashcardsBusy;
  /** The half-typed card, held by the hook so it survives the popup closing. Without these the panel keeps its own. */
  draft?: CardDraft | null;
  setDraft?: (draft: CardDraft | null) => void;
  add: (front: string, back: string) => Promise<Answer>;
  edit: (id: string, front: string, back: string) => Promise<Answer>;
  remove: (id: string) => Promise<Answer>;
  review: (id: string, result: ReviewResult) => Promise<Answer>;
  generate: () => Promise<Answer>;
  reload: () => void;
  /** Tests only: start on this tab or with the answer shown. */
  initialTab?: 'review' | 'cards';
  initialRevealed?: boolean;
  /** Tests only: the time due cards are counted from. */
  initialNow?: Date;
};

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const PILL = `inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-small text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${RING}`;
const PRIMARY = `inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-small font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${RING}`;
const FIELD = 'w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-small text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary';

/** "Next card due 3 Dec" for the caught-up message. */
function nextDueLine(cards: readonly CardView[]): string {
  const next = [...cards].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  if (!next) return '';
  return ` Next card due ${new Date(next.dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`;
}

/** The Flashcards popup in the lesson header: review due cards, or add, edit, delete and make cards. */
export function StageFlashcards(props: StageFlashcardsProps) {
  const { cards, status } = props;
  // A half-typed card waiting from before the popup closed opens on its tab.
  const [tab, setTab] = useState<'review' | 'cards'>(props.initialTab ?? (props.draft ? 'cards' : 'review'));
  // The answer shown belongs to one card, so another card never opens already answered.
  const [revealedId, setRevealedId] = useState<string | null>(
    props.initialRevealed ? (dueCards(props.cards, props.initialNow ?? new Date())[0]?.id ?? null) : null
  );
  const [now, setNow] = useState(() => props.initialNow ?? new Date());
  const [error, setError] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<CardDraft | null>(null);
  const draft = props.setDraft ? (props.draft ?? null) : localDraft;
  const setDraft = props.setDraft ?? setLocalDraft;
  // Delete asks first: the id of the card waiting for "Delete" or "Keep".
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmingId) keepRef.current?.focus();
  }, [confirmingId]);
  const busy = props.busy ?? null;

  // After an action, focus goes to the control that replaces the one just used.
  const focusNext = useRef<'got-it' | 'show' | null>(null);
  const gotItRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const element = target === 'got-it' ? gotItRef.current : showRef.current;
    (element ?? panelRef.current?.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
  });

  const run = async (action: () => Promise<Answer>, after?: () => void) => {
    setError(null);
    const answer = await action();
    if (answer.ok) after?.();
    else setError(answer.error);
  };

  if (status === 'loading') return <p className="text-small text-muted-foreground">Loading your cards…</p>;
  if (status === 'unavailable') return <p className="text-small text-destructive">{FLASHCARDS_UNAVAILABLE_MESSAGE}</p>;
  if (status === 'load-error') {
    return (
      <p className="text-small text-destructive">
        Couldn&apos;t load your cards.{' '}
        <button type="button" onClick={props.reload} className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
          Try again
        </button>
      </p>
    );
  }

  const due = dueCards(cards, now);
  const current = due[0];
  const revealed = !!current && revealedId === current.id;
  const afterReview = () => {
    setRevealedId(null);
    setNow(new Date());
    focusNext.current = 'show';
  };

  const makeButton = (
    <button type="button" className={PILL} disabled={busy !== null} onClick={() => run(props.generate, () => setNow(new Date()))}>
      {busy === 'generate' && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {busy === 'generate' ? 'Making cards…' : 'Make cards from this stage'}
    </button>
  );

  const form = draft && (
    <form
      className="flex flex-col gap-2 rounded-md border border-border p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const action = draft.id ? () => props.edit(draft.id as string, draft.front, draft.back) : () => props.add(draft.front, draft.back);
        void run(action, () => {
          setDraft(null);
          setNow(new Date());
        });
      }}
    >
      <textarea
        aria-label="Question"
        placeholder="Question"
        rows={2}
        maxLength={MAX_FRONT_LENGTH}
        value={draft.front}
        onChange={(e) => setDraft({ ...draft, front: e.target.value })}
        className={FIELD}
      />
      <textarea
        aria-label="Answer"
        placeholder="Answer"
        rows={3}
        maxLength={MAX_BACK_LENGTH}
        value={draft.back}
        onChange={(e) => setDraft({ ...draft, back: e.target.value })}
        className={FIELD}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className={PILL} onClick={() => setDraft(null)}>
          Cancel
        </button>
        <button type="submit" className={PRIMARY} disabled={busy !== null || !draft.front.trim() || !draft.back.trim()}>
          Save card
        </button>
      </div>
    </form>
  );

  return (
    <div ref={panelRef} className="flex flex-col gap-3">
      <div role="tablist" aria-label="Flashcards" className="flex gap-1">
        {(['review', 'cards'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`flashcards-tab-${name}`}
            aria-controls={`flashcards-panel-${name}`}
            aria-selected={tab === name}
            onClick={() => {
              setTab(name);
              setError(null);
              setNow(new Date());
            }}
            className={cn(
              'rounded-full px-3 py-1 text-small transition-colors',
              RING,
              tab === name ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {name === 'review' ? `Review (${due.length} due)` : `All cards (${cards.length})`}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}

      {tab === 'review' && (
        <div role="tabpanel" id="flashcards-panel-review" aria-labelledby="flashcards-tab-review">
        {current ? (
          <div className="flex flex-col gap-3">
            <p className="text-caption text-muted-foreground">
              {due.length === 1 ? '1 card due' : `${due.length} cards due`}
            </p>
            <p className="text-body font-medium text-foreground">{current.front}</p>
            {revealed ? (
              <>
                <p className="whitespace-pre-line border-t border-border pt-3 text-body text-foreground-secondary">{current.back}</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={PILL}
                    disabled={busy !== null}
                    onClick={() => run(() => props.review(current.id, 'again'), afterReview)}
                  >
                    Again
                  </button>
                  <button
                    ref={gotItRef}
                    type="button"
                    className={PRIMARY}
                    disabled={busy !== null}
                    onClick={() => run(() => props.review(current.id, 'good'), afterReview)}
                  >
                    Got it
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-end">
                <button
                  ref={showRef}
                  type="button"
                  className={PRIMARY}
                  onClick={() => {
                    setRevealedId(current.id);
                    focusNext.current = 'got-it';
                  }}
                >
                  Show answer
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2.5">
            <p className="text-small text-muted-foreground">
              {cards.length ? `All caught up.${nextDueLine(cards)}` : 'No cards yet. Make some from this stage, or add your own.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {makeButton}
              <button type="button" className={PILL} onClick={() => { setTab('cards'); setDraft({ id: null, front: '', back: '' }); }}>
                Add a card
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      {tab === 'cards' && (
        <div role="tabpanel" id="flashcards-panel-cards" aria-labelledby="flashcards-tab-cards" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            {makeButton}
            {!draft && (
              <button type="button" className={PILL} onClick={() => setDraft({ id: null, front: '', back: '' })}>
                Add a card
              </button>
            )}
          </div>
          {draft && !draft.id && form}
          {cards.length === 0 && !draft && <p className="text-small text-muted-foreground">No cards yet.</p>}
          <ul className="flex flex-col gap-2" aria-label="Cards">
            {cards.map((card) =>
              draft?.id === card.id ? (
                <li key={card.id}>{form}</li>
              ) : (
                <li key={card.id} className="rounded-md border border-border p-2.5">
                  <p className="text-small font-medium text-foreground">{card.front}</p>
                  <p className="mt-1 whitespace-pre-line text-small text-muted-foreground">{card.back}</p>
                  <div className="mt-1.5 flex gap-3">
                    <button
                      type="button"
                      aria-label={`Edit card: ${card.front}`}
                      disabled={busy !== null}
                      className={cn('rounded-sm text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50', RING)}
                      onClick={() => setDraft({ id: card.id, front: card.front, back: card.back })}
                    >
                      Edit
                    </button>
                    {confirmingId === card.id ? (
                      <span role="group" aria-label={`Delete card: ${card.front}?`} className="flex items-center gap-2 text-caption text-foreground">
                        Delete this card?
                        <button
                          type="button"
                          disabled={busy !== null}
                          className={cn('rounded-sm font-medium text-destructive underline underline-offset-2 disabled:opacity-50', RING)}
                          onClick={() => run(() => props.remove(card.id), () => setConfirmingId(null))}
                        >
                          Delete
                        </button>
                        <button
                          ref={keepRef}
                          type="button"
                          className={cn('rounded-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline', RING)}
                          onClick={() => setConfirmingId(null)}
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete card: ${card.front}`}
                        disabled={busy !== null}
                        className={cn('rounded-sm text-caption text-destructive underline-offset-2 hover:underline disabled:opacity-50', RING)}
                        onClick={() => setConfirmingId(card.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
