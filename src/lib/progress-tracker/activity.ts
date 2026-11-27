// src/lib/progress-tracker/activity.ts
//
// Client-safe helpers for "pick up where you left off": no database access here.

import type { StageProgress } from './index';

/** When a stage was last studied: the time of its latest lesson message, or null. */
export interface StageActivity {
  stageId: string;
  /** ISO time of the stage's latest TeachingMessage, or null when it has none. */
  lastStudiedAt: string | null;
  /** Seconds of active study on the stage; absent counts as 0. */
  studySeconds?: number;
}

/** Activity as the journey map uses it: per-stage times plus the moment they were read. */
export interface JourneyActivity {
  stages: StageActivity[];
  now: Date;
}

/**
 * One entry per stage, in the given order. Last studied is the later of the stage's latest message and
 * the study time's lastStudiedAt (a stretch of reading counts too; a brief peek does not); null when neither.
 */
export function stageActivity(
  stageIds: readonly string[],
  latest: readonly { stageId: string; at: Date | null }[],
  study: readonly { stageId: string; seconds: number; lastStudiedAt?: Date | null }[] = []
): StageActivity[] {
  const byStage = new Map(latest.map((row) => [row.stageId, row.at]));
  const studied = new Map(study.map((row) => [row.stageId, row]));
  return stageIds.map((stageId) => {
    const message = byStage.get(stageId) ?? null;
    const row = studied.get(stageId);
    const timed = row?.lastStudiedAt ?? null;
    const at = message && timed ? (timed > message ? timed : message) : message ?? timed;
    return { stageId, lastStudiedAt: at ? at.toISOString() : null, studySeconds: row?.seconds ?? 0 };
  });
}

/** Reads the activity endpoint's JSON; anything malformed counts as no activity. */
export function parseActivity(data: unknown): StageActivity[] | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { stages?: unknown }).stages)) return null;
  const stages: StageActivity[] = [];
  for (const item of (data as { stages: unknown[] }).stages) {
    if (!item || typeof item !== 'object') return null;
    const { stageId, lastStudiedAt, studySeconds } = item as Record<string, unknown>;
    if (typeof stageId !== 'string') return null;
    if (lastStudiedAt !== null && (typeof lastStudiedAt !== 'string' || Number.isNaN(Date.parse(lastStudiedAt)))) return null;
    if (studySeconds !== undefined && (typeof studySeconds !== 'number' || !Number.isFinite(studySeconds) || studySeconds < 0)) return null;
    stages.push({ stageId, lastStudiedAt, studySeconds: studySeconds ?? 0 });
  }
  return stages;
}

const isOpen = (status: StageProgress['status'] | undefined) => status === 'unlocked' || status === 'in_progress';

/**
 * The stage the Continue button opens: the most recently studied stage that is open
 * (unlocked or in progress, so not completed and not locked); otherwise the first open
 * stage by order; null when no stage is open (for example, the journey is complete).
 */
export function resumeTarget(
  stages: readonly { id: string; order: number }[],
  progress: readonly Pick<StageProgress, 'stageId' | 'status'>[],
  activity: readonly StageActivity[]
): string | null {
  const status = new Map(progress.map((p) => [p.stageId, p.status]));
  const known = new Set(stages.map((s) => s.id));
  let latest: { stageId: string; at: number } | null = null;
  for (const entry of activity) {
    if (!entry.lastStudiedAt || !known.has(entry.stageId) || !isOpen(status.get(entry.stageId))) continue;
    const at = Date.parse(entry.lastStudiedAt);
    if (!Number.isNaN(at) && (!latest || at > latest.at)) latest = { stageId: entry.stageId, at };
  }
  if (latest) return latest.stageId;
  const first = [...stages].sort((a, b) => a.order - b.order).find((s) => isOpen(status.get(s.id)));
  return first?.id ?? null;
}

const DAY_MS = 86_400_000;
const localDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Last studied today", "yesterday" or "N days ago", by local calendar day; a future time counts as today. */
export function lastStudiedLabel(at: Date, now: Date): string {
  const days = Math.max(0, Math.round((localDay(now) - localDay(at)) / DAY_MS));
  if (days === 0) return 'Last studied today';
  if (days === 1) return 'Last studied yesterday';
  return `Last studied ${days} days ago`;
}
