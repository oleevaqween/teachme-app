// src/app/api/journey/[id]/activity/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { stageActivity } from '@/lib/progress-tracker/activity';
import { readActivityRows } from '@/lib/progress-tracker/activity-rows';

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

    const rows = await readActivityRows({ journeyId: id });

    return NextResponse.json({
      stages: stageActivity(stages.map((s) => s.id), rows.latest, rows.study, rows.checks, rows.due),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
