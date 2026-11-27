// src/app/api/journey/[id]/activity/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { stageActivity } from '@/lib/progress-tracker/activity';
import { isMissingStudyTimeTable } from '@/lib/progress-tracker/study-time';
import { isMissingCheckResultTable } from '@/lib/teaching-session-engine/check-score';
import { isMissingFlashcardTable } from '@/lib/teaching-session-engine/flashcards';

/**
 * GET /api/journey/[id]/activity
 * Read-only: for each stage of the journey, when it was last studied (latest TeachingMessage or study time) and its study time.
 * Response: { stages: { stageId: string; lastStudiedAt: string | null; studySeconds: number }[] } in stage order.
 * Also the latest check score per stage (lastCheck, or null) and the flashcards due now (dueCards).
 * A database without the study time or check tables (not yet updated) reports 0 seconds and no checks.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const journey = await prisma.journey.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!journey) {
      return NextResponse.json(
        { error: 'Journey not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const stages = await prisma.stage.findMany({
      where: { journeyId: id },
      select: { id: true },
      orderBy: { order: 'asc' },
    });

    const latest = await prisma.teachingMessage.groupBy({
      by: ['stageId'],
      where: { journeyId: id },
      _max: { createdAt: true },
    });

    // Study time is optional: a database not yet updated, or any error reading it, shows no times
    // rather than costing the map its dates and Continue button.
    let study: { stageId: string; seconds: number; lastStudiedAt: Date | null }[] = [];
    try {
      study = await prisma.stageStudyTime.findMany({
        where: { journeyId: id },
        select: { stageId: true, seconds: true, lastStudiedAt: true },
      });
    } catch (error) {
      if (!isMissingStudyTimeTable(error)) console.error('Study time could not be read:', error);
    }

    // Check scores are optional in the same way.
    let checks: { stageId: string; correct: number; total: number; createdAt: Date }[] = [];
    try {
      checks = await prisma.checkResult.findMany({
        where: { journeyId: id },
        select: { stageId: true, correct: true, total: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (!isMissingCheckResultTable(error)) console.error('Check scores could not be read:', error);
    }

    // Due flashcards are optional in the same way.
    let due: { stageId: string; count: number }[] = [];
    try {
      const rows = await prisma.flashcard.groupBy({
        by: ['stageId'],
        where: { journeyId: id, dueAt: { lte: new Date() } },
        _count: { _all: true },
      });
      due = rows.map((row) => ({ stageId: row.stageId, count: row._count._all }));
    } catch (error) {
      if (!isMissingFlashcardTable(error)) console.error('Flashcards could not be read:', error);
    }

    return NextResponse.json({
      stages: stageActivity(
        stages.map((s) => s.id),
        latest.map((row) => ({ stageId: row.stageId, at: row._max.createdAt })),
        study,
        checks,
        due
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
