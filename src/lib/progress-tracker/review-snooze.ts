// src/lib/progress-tracker/review-snooze.ts
//
// Client-safe: snoozed "Due for review" reminders, kept in this browser's storage (no database change).

import type { ReviewItem } from './review-reminders';
import { MAX_REMINDERS } from './review-reminders';

/** How long Snooze hides a reminder. */
export const SNOOZE_DAYS = 3;
export const SNOOZE_STORAGE_KEY = 'teachme.review-snooze.v1';

const DAY_MS = 86_400_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Stage id to the ISO time its snooze ends. */
export type Snoozes = Record<string, string>;

/** The snoozes still running at `now`; unreadable or expired entries are dropped. */
export function readSnoozes(storage: StorageLike | null, now: Date): Snoozes {
  if (!storage) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.getItem(SNOOZE_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Snoozes = {};
  for (const [stageId, until] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof until === 'string' && Date.parse(until) > now.getTime()) out[stageId] = until;
  }
  return out;
}

function write(storage: StorageLike | null, snoozes: Snoozes): void {
  try {
    storage?.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(snoozes));
  } catch {
    // Storage may be full or blocked; the snooze then lasts only until the page reloads.
  }
}

/** Snoozes a stage's reminder for SNOOZE_DAYS from `now`; returns the new set (expired ones dropped). */
export function snoozeStage(storage: StorageLike | null, stageId: string, now: Date): Snoozes {
  const next = { ...readSnoozes(storage, now), [stageId]: new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString() };
  write(storage, next);
  return next;
}

/** Ends a stage's snooze (Undo); returns the new set. */
export function unsnoozeStage(storage: StorageLike | null, stageId: string, now: Date): Snoozes {
  const next = readSnoozes(storage, now);
  delete next[stageId];
  write(storage, next);
  return next;
}

/** The reminders to show: snoozed ones left out, at most `limit`, and how many are due in all (unsnoozed). */
export function visibleReminders(
  items: readonly ReviewItem[],
  snoozes: Snoozes,
  limit: number = MAX_REMINDERS
): { items: ReviewItem[]; total: number } {
  const awake = items.filter((item) => !snoozes[item.stageId]);
  return { items: awake.slice(0, limit), total: awake.length };
}
