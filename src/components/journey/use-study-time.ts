'use client';

import { useEffect, useRef } from 'react';
import { createStudyTimer, TICK_MS, type StudyTimer, type TimeSendResult } from '@/lib/progress-tracker/study-time';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/** Turns a study time response into a send result. A 4xx (stage gone, bad request) or 503 will not succeed later, so it stops sending. */
function sendResult(response: Response): TimeSendResult {
  if (response.ok) return 'saved';
  if (response.status === 503 || (response.status >= 400 && response.status < 500)) return 'unavailable';
  return 'error';
}

/** Study time requests still on their way, so the map can wait for the last one before reading totals. */
const inFlight = new Set<Promise<unknown>>();

/** Resolves once every study time request sent so far has finished (successfully or not). */
export function studyTimeSaved(): Promise<void> {
  return Promise.allSettled([...inFlight]).then(() => undefined);
}

/**
 * Counts active study time while this lesson is open and adds it to the stage's total.
 * `busy` (a reply is being written) counts as studying without input.
 */
export function useStudyTime(journeyId: string, stageId: string, busy: boolean) {
  const timerRef = useRef<StudyTimer | null>(null);
  const busyRef = useRef(busy);

  useEffect(() => {
    const url = `/api/journey/${journeyId}/stage/${stageId}/time`;
    const timer = createStudyTimer({
      now: () => Date.now(),
      send: (seconds, keepalive) => {
        const request = fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds }),
          keepalive,
        }).then(sendResult);
        inFlight.add(request);
        void request.catch(() => {}).finally(() => inFlight.delete(request));
        return request;
      },
    });
    timerRef.current = timer;
    timer.setVisible(document.visibilityState === 'visible');
    timer.setBusy(busyRef.current);
    timer.activity();

    const onActivity = () => timer.activity();
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      timer.setVisible(visible);
      if (visible) timer.activity();
      else timer.flush(true);
    };
    const onPageHide = () => timer.flush(true);
    for (const name of ACTIVITY_EVENTS) document.addEventListener(name, onActivity, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    const interval = window.setInterval(() => timer.tick(), TICK_MS);

    return () => {
      window.clearInterval(interval);
      for (const name of ACTIVITY_EVENTS) document.removeEventListener(name, onActivity, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      timer.dispose();
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [journeyId, stageId]);

  useEffect(() => {
    busyRef.current = busy;
    timerRef.current?.setBusy(busy);
  }, [busy]);
}
