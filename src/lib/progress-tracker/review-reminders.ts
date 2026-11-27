// src/lib/progress-tracker/review-reminders.ts
//
// Client-safe: which stages are due for review, worked out from data TeachMe already keeps
// (flashcards due, the latest check score, completion and study dates). Nothing is stored.

/** A check below this share of correct answers suggests trying it again. */
export const LOW_CHECK_SHARE = 0.7;
/** A completed stage untouched for this many days is due for a refresh. */
export const STALE_DAYS = 14;
/** Most reminders shown at once. */
export const MAX_REMINDERS = 5;

const DAY_MS = 86_400_000;

export type ReviewReason =
  | { kind: 'cards'; count: number }
  | { kind: 'check'; correct: number; total: number }
  | { kind: 'stale'; days: number };

export type ReviewItem = {
  journeyId: string;
  journeyTopic: string;
  stageId: string;
  stageOrder: number;
  stageTitle: string;
  reason: ReviewReason;
};

export type ReviewStageInput = {
  id: string;
  order: number;
  title: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  completedAt: string | null;
  lastStudiedAt: string | null;
  lastCheck: { correct: number; total: number } | null;
  dueCards: number;
};

export type ReviewJourneyInput = { id: string; topic: string; stages: ReviewStageInput[] };

/**
 * One reminder per stage, by the first reason that applies: flashcards due; a last check under
 * LOW_CHECK_SHARE; a completed stage untouched for STALE_DAYS or more. Locked stages are skipped.
 * Ordered cards (most due first), then checks (lowest share first), then stale (longest first).
 */
export function reviewItems(journeys: readonly ReviewJourneyInput[], now: Date): ReviewItem[] {
  const rank = (reason: ReviewReason): [number, number] =>
    reason.kind === 'cards' ? [0, -reason.count] : reason.kind === 'check' ? [1, reason.correct / reason.total] : [2, -reason.days];
  const items: ReviewItem[] = [];
  for (const journey of journeys) {
    for (const stage of journey.stages) {
      if (stage.status === 'locked') continue;
      let reason: ReviewReason | null = null;
      if (stage.dueCards > 0) {
        reason = { kind: 'cards', count: stage.dueCards };
      } else if (stage.lastCheck && stage.lastCheck.total > 0 && stage.lastCheck.correct / stage.lastCheck.total < LOW_CHECK_SHARE) {
        reason = { kind: 'check', correct: stage.lastCheck.correct, total: stage.lastCheck.total };
      } else if (stage.status === 'completed') {
        const touched = Math.max(
          stage.completedAt ? Date.parse(stage.completedAt) : 0,
          stage.lastStudiedAt ? Date.parse(stage.lastStudiedAt) : 0
        );
        const days = touched ? Math.floor((now.getTime() - touched) / DAY_MS) : 0;
        if (days >= STALE_DAYS) reason = { kind: 'stale', days };
      }
      if (reason) {
        items.push({ journeyId: journey.id, journeyTopic: journey.topic, stageId: stage.id, stageOrder: stage.order, stageTitle: stage.title, reason });
      }
    }
  }
  return items.sort((a, b) => {
    const [ka, va] = rank(a.reason);
    const [kb, vb] = rank(b.reason);
    return ka - kb || va - vb;
  });
}

/** The short reason shown next to a reminder. */
export function reasonLabel(reason: ReviewReason): string {
  switch (reason.kind) {
    case 'cards':
      return `${reason.count} ${reason.count === 1 ? 'card' : 'cards'} due`;
    case 'check':
      return `Last check ${reason.correct}/${reason.total}: try it again`;
    case 'stale':
      return reason.days < 28 ? `Not studied for ${reason.days} days` : `Not studied for ${Math.floor(reason.days / 7)} weeks`;
  }
}

/** The address that opens the stage straight away. */
export function reviewHref(item: Pick<ReviewItem, 'journeyId' | 'stageId'>): string {
  return `/teach-me/journey/${encodeURIComponent(item.journeyId)}?stage=${encodeURIComponent(item.stageId)}`;
}

/** Reads the review endpoint's JSON; anything malformed counts as no reminders. */
export function parseReviewItems(data: unknown): ReviewItem[] {
  const items = data && typeof data === 'object' ? (data as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is ReviewItem => {
    if (!item || typeof item !== 'object') return false;
    const i = item as Record<string, unknown>;
    const reason = i.reason as Record<string, unknown> | undefined;
    return (
      typeof i.journeyId === 'string' &&
      typeof i.journeyTopic === 'string' &&
      typeof i.stageId === 'string' &&
      typeof i.stageOrder === 'number' &&
      typeof i.stageTitle === 'string' &&
      !!reason &&
      (reason.kind === 'cards' || reason.kind === 'check' || reason.kind === 'stale')
    );
  });
}
