'use client';
import { useEffect, useState } from 'react';

/** A spoken STAR answer usually fits in about two minutes. */
export const TIMER_GUIDE_SECONDS = 120;

/** A start time that makes `seconds` already elapsed at `now`; null when nothing has elapsed yet. */
export function resumedStart(now: number, seconds: number): number | null {
  return seconds > 0 ? now - Math.min(3600, seconds) * 1000 : null;
}

/** Counts the draft's seconds from the first keystroke or the mic; `initialSeconds` resumes a returned-to draft. */
export function useAnswerTimer(initialSeconds = 0) {
  const [{ startedAt, now }, setClock] = useState(() => {
    const t = Date.now();
    return { startedAt: resumedStart(t, initialSeconds), now: t };
  });
  const setStartedAt = (value: number) => setClock((c) => ({ ...c, startedAt: value }));
  const setNow = (value: number) => setClock((c) => ({ ...c, now: value }));

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  function start() {
    if (startedAt !== null) return;
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
  }

  /** Exact elapsed seconds, read at submit time (not during render). */
  function elapsedNow(): number {
    return startedAt === null ? 0 : Math.min(3600, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
  }

  const seconds = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  return { seconds, running: startedAt !== null, start, elapsedNow };
}
