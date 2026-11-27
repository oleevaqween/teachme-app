'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dueCards, type CardView, type ReviewResult } from '@/lib/teaching-session-engine/flashcards';

export type FlashcardsStatus = 'loading' | 'ready' | 'load-error' | 'unavailable';

/** A card being added (id null) or edited. Kept in the hook, so closing the popup (also by Escape) keeps it. */
export type CardDraft = { id: string | null; front: string; back: string };

/** The action in progress, if any. Kept in the hook, so closing and reopening the popup cannot start a second one. */
export type FlashcardsBusy = 'add' | 'edit' | 'remove' | 'review' | 'generate' | null;

type Answer = { ok: true } | { ok: false; error: string };

/** The error text a failed response carries, or a plain fallback. */
async function errorText(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === 'string' ? data.error : fallback;
}

/**
 * The stage's flashcards: loads them once, then adds, edits, deletes, reviews and asks the AI for more,
 * keeping the list in step with each saved change. Actions resolve to { ok } or { ok: false, error }.
 */
export function useStageFlashcards(journeyId: string, stageId: string) {
  const base = `/api/journey/${journeyId}/stage/${stageId}/flashcards`;
  // `at` is when the cards last changed, so the due count is worked out without reading the clock while rendering.
  const [raw, setRaw] = useState<{ base: string; cards: CardView[]; status: FlashcardsStatus; at: number }>({
    base,
    cards: [],
    status: 'loading',
    at: 0,
  });
  const state = raw;
  type Update = { base: string; cards: CardView[]; status: FlashcardsStatus } | ((prev: typeof raw) => { base: string; cards: CardView[]; status: FlashcardsStatus; at?: number });
  const setState = useCallback((update: Update) => {
    setRaw((prev) => ({ ...(typeof update === 'function' ? update(prev) : update), at: Date.now() }));
  }, []);
  const [loadRequest, setLoadRequest] = useState(0);
  const [busy, setBusy] = useState<FlashcardsBusy>(null);
  const [draftState, setDraftState] = useState<{ base: string; draft: CardDraft | null }>({ base, draft: null });
  const draft = draftState.base === base ? draftState.draft : null;
  const setDraft = useCallback((next: CardDraft | null) => setDraftState({ base, draft: next }), [base]);
  const busyRef = useRef(false);

  /** Runs one action at a time; a second one while another is saving is turned away. */
  const once = useCallback(async (name: Exclude<FlashcardsBusy, null>, action: () => Promise<Answer>): Promise<Answer> => {
    if (busyRef.current) return { ok: false, error: 'Still saving the last change. Please wait a moment.' };
    busyRef.current = true;
    setBusy(name);
    try {
      return await action();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, []);
  const current = state.base === base ? state : { base, cards: [] as CardView[], status: 'loading' as const, at: 0 };

  useEffect(() => {
    let cancelled = false;
    fetch(base)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { cards?: CardView[]; code?: string };
        if (cancelled) return;
        if (response.ok && Array.isArray(data.cards)) setState({ base, cards: data.cards, status: 'ready' });
        else setState({ base, cards: [], status: data.code === 'FLASHCARDS_UNAVAILABLE' ? 'unavailable' : 'load-error' });
      })
      .catch(() => {
        if (!cancelled) setState({ base, cards: [], status: 'load-error' });
      });
    return () => {
      cancelled = true;
    };
  }, [base, loadRequest, setState]);

  const replace = useCallback(
    (card: CardView) => setState((prev) => (prev.base === base ? { ...prev, cards: prev.cards.map((c) => (c.id === card.id ? card : c)) } : prev)),
    [base, setState]
  );

  const send = useCallback(
    async (url: string, method: string, body: unknown, fallback: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> => {
      try {
        const response = await fetch(url, {
          method,
          headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) return { ok: false, error: await errorText(response, fallback) };
        return { ok: true, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
      } catch {
        return { ok: false, error: fallback };
      }
    },
    []
  );

  const add = useCallback(
    (front: string, back: string): Promise<Answer> => once('add', async () => {
      const result = await send(base, 'POST', { front, back }, "Couldn't save the card. Please try again.");
      if (!result.ok) return result;
      const card = result.data.card as CardView;
      setState((prev) => (prev.base === base ? { ...prev, cards: [...prev.cards, card] } : prev));
      return { ok: true } as const;
    }),
    [base, send, setState, once]
  );

  const edit = useCallback(
    (id: string, front: string, back: string): Promise<Answer> => once('edit', async () => {
      const result = await send(`${base}/${id}`, 'PATCH', { front, back }, "Couldn't save the card. Please try again.");
      if (!result.ok) return result;
      replace(result.data.card as CardView);
      return { ok: true } as const;
    }),
    [base, send, replace, once]
  );

  const remove = useCallback(
    (id: string): Promise<Answer> => once('remove', async () => {
      const result = await send(`${base}/${id}`, 'DELETE', undefined, "Couldn't delete the card. Please try again.");
      if (!result.ok) return result;
      setState((prev) => (prev.base === base ? { ...prev, cards: prev.cards.filter((c) => c.id !== id) } : prev));
      return { ok: true } as const;
    }),
    [base, send, setState, once]
  );

  const review = useCallback(
    (id: string, result: ReviewResult): Promise<Answer> => once('review', async () => {
      const answer = await send(`${base}/${id}`, 'POST', { result }, "Couldn't save that answer. Please try again.");
      if (!answer.ok) return answer;
      replace(answer.data.card as CardView);
      return { ok: true } as const;
    }),
    [base, send, replace, once]
  );

  const generate = useCallback((): Promise<Answer> => once('generate', async () => {
    const result = await send(`${base}/generate`, 'POST', undefined, "Couldn't make cards just now. Please try again.");
    if (!result.ok) return result;
    const cards = result.data.cards as CardView[];
    setState((prev) => (prev.base === base ? { ...prev, cards: [...prev.cards, ...cards] } : prev));
    return { ok: true } as const;
  }), [base, send, setState, once]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    setLoadRequest((count) => count + 1);
  }, [setState]);

  const dueCount = current.status === 'ready' ? dueCards(current.cards, new Date(current.at)).length : 0;

  return { cards: current.cards, status: current.status, dueCount, busy, draft, setDraft, add, edit, remove, review, generate, reload };
}

export type StageFlashcardsApi = ReturnType<typeof useStageFlashcards>;
