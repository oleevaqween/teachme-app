'use client';
import { useEffect, useState } from 'react';

/** A spoken STAR answer usually fits in about two minutes. */
export const TIMER_GUIDE_SECONDS = 120;

export function useAnswerTimer() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

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
