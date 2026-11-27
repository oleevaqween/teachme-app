// src/lib/progress-tracker/activity-rows.ts
//
// Server-only, read-only: the rows the journey map and the review reminders are built from. Study time,
// check scores and flashcards are optional: a database not yet updated, or any error reading them, gives
// none of those rows instead of failing the caller.

import { prisma } from '@/lib/db/client';
import { isMissingStudyTimeTable } from './study-time';
import { isMissingCheckResultTable } from '@/lib/teaching-session-engine/check-score';
import { isMissingFlashcardTable } from '@/lib/teaching-session-engine/flashcards';

export type ActivityRows = {
  latest: { stageId: string; at: Date | null }[];
  study: { stageId: string; seconds: number; lastStudiedAt: Date | null }[];
  checks: { stageId: string; correct: number; total: number; createdAt: Date }[];
  due: { stageId: string; count: number }[];
};

/** Which journeys to read: one, or several. */
export type JourneyFilter = { journeyId: string } | { journeyId: { in: string[] } };

async function optional<T>(read: () => Promise<T[]>, isMissing: (error: unknown) => boolean, what: string): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    if (!isMissing(error)) console.error(`${what} could not be read:`, error);
    return [];
  }
}

/** Reads the latest message time, study time, check scores and due flashcards for the journeys in `where`. */
export async function readActivityRows(where: JourneyFilter, now: Date = new Date()): Promise<ActivityRows> {
  const latest = await prisma.teachingMessage.groupBy({ by: ['stageId'], where, _max: { createdAt: true } });
  const study = await optional(
    () => prisma.stageStudyTime.findMany({ where, select: { stageId: true, seconds: true, lastStudiedAt: true } }),
    isMissingStudyTimeTable,
    'Study time'
  );
  const checks = await optional(
    () =>
      prisma.checkResult.findMany({
        where,
        select: { stageId: true, correct: true, total: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    isMissingCheckResultTable,
    'Check scores'
  );
  const due = await optional(
    async () =>
      (
        await prisma.flashcard.groupBy({ by: ['stageId'], where: { ...where, dueAt: { lte: now } }, _count: { _all: true } })
      ).map((row) => ({ stageId: row.stageId, count: row._count._all })),
    isMissingFlashcardTable,
    'Flashcards'
  );
  return {
    latest: latest.map((row) => ({ stageId: row.stageId, at: row._max.createdAt })),
    study,
    checks,
    due,
  };
}
