// src/lib/progress-tracker/study-time.ts
//
// Client-safe: how study time is counted in the lesson view, the request it sends, and its labels.

/** Time after the learner's last action that still counts as studying (reading without touching anything). */
export const IDLE_MS = 3 * 60_000;

/** How often the lesson view ticks the timer. */
export const TICK_MS = 5_000;

/** A gap between ticks longer than this (the computer slept, the tab was frozen) is not counted. */
export const MAX_TICK_GAP_MS = 15_000;

/** How often counted time is sent. */
export const SEND_EVERY_MS = 60_000;

/** While a reply is arriving, time counts without input, but only this long after the learner's last action. */
export const BUSY_MAX_MS = 10 * 60_000;

/** A single send this long or longer also marks the stage as last studied now. */
export const MIN_SECONDS_FOR_LAST_STUDIED = 30;

/** Most seconds one request may add. */
export const MAX_INCREMENT_SECONDS = 900;

export type TimeBody = { ok: true; seconds: number } | { ok: false; error: string };

/** Checks a POST body: `{ seconds }`, a whole number from 1 to MAX_INCREMENT_SECONDS. */
export function parseTimeBody(body: unknown): TimeBody {
  const seconds = body && typeof body === 'object' ? (body as { seconds?: unknown }).seconds : undefined;
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_INCREMENT_SECONDS) {
    return { ok: false, error: `Send { seconds } as a whole number from 1 to ${MAX_INCREMENT_SECONDS}.` };
  }
  return { ok: true, seconds };
}

/** True for the error a database without the StageStudyTime table gives (before `npm run db:setup`). */
export function isMissingStudyTimeTable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/no such table: (main\.)?"?StageStudyTime"?\b/i.test(error.message)) return true;
  return (error as { code?: unknown }).code === 'P2021' && /\bStageStudyTime\b/.test(error.message);
}

/** "25 min", "1 h", "1 h 5 min"; null under a minute. */
export function studyTimeLabel(seconds: number): string | null {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "Time studied: 1 h 20 min" for the whole journey; null under a minute. */
export function totalStudyLabel(seconds: readonly number[]): string | null {
  const label = studyTimeLabel(seconds.reduce((sum, s) => sum + s, 0));
  return label ? `Time studied: ${label}` : null;
}

export type TimeSendResult = 'saved' | 'error' | 'unavailable';

export type StudyTimer = {
  /** The learner did something (scroll, key, pointer). */
  activity(): void;
  setVisible(visible: boolean): void;
  /** A reply is being written: counts as studying without input. */
  setBusy(busy: boolean): void;
  /** Called every TICK_MS: counts the time since the last tick and sends each minute. */
  tick(): void;
  /** Sends counted time now (keepalive when the page is going away). */
  flush(keepalive?: boolean): void;
  /** Counts up to now, sends the rest with keepalive, then stops. */
  dispose(): void;
};

/**
 * Counts active study time: the window is visible and the learner acted in the last IDLE_MS
 * (or a reply is arriving and they acted in the last BUSY_MAX_MS). Sends whole seconds once a minute; a failed send keeps its time for the
 * next one; a database without the table stops sending.
 */
export function createStudyTimer(options: {
  now: () => number;
  send: (seconds: number, keepalive: boolean) => Promise<TimeSendResult>;
}): StudyTimer {
  const { now, send } = options;
  let lastTick = now();
  let lastActivity = Number.NEGATIVE_INFINITY;
  let lastSend = lastTick;
  let visible = true;
  let busy = false;
  let pendingMs = 0;
  let stopped = false;
  let disposed = false;

  const count = () => {
    const at = now();
    const elapsed = at - lastTick;
    lastTick = at;
    if (elapsed <= 0 || elapsed > MAX_TICK_GAP_MS) return;
    const sinceAction = at - lastActivity;
    if (visible && (sinceAction <= IDLE_MS || (busy && sinceAction <= BUSY_MAX_MS))) pendingMs += elapsed;
  };

  const flush = (keepalive = false) => {
    lastSend = now();
    if (stopped) return;
    const seconds = Math.min(Math.floor(pendingMs / 1000), MAX_INCREMENT_SECONDS);
    if (seconds < 1) return;
    pendingMs -= seconds * 1000;
    send(seconds, keepalive)
      .catch((): TimeSendResult => 'error')
      .then((result) => {
        if (result === 'unavailable') stopped = true;
        else if (result === 'error') pendingMs += seconds * 1000;
      });
  };

  return {
    activity() {
      lastActivity = now();
    },
    setVisible(value) {
      count();
      visible = value;
    },
    setBusy(value) {
      count();
      // A reply just finished: the learner starts reading it now.
      if (busy && !value) lastActivity = now();
      busy = value;
    },
    tick() {
      if (disposed) return;
      count();
      if (now() - lastSend >= SEND_EVERY_MS) flush(false);
    },
    flush,
    dispose() {
      if (disposed) return;
      count();
      flush(true);
      disposed = true;
      stopped = true;
    },
  };
}
