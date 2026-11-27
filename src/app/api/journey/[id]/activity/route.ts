// src/app/api/journey/[id]/activity/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { stageActivity } from '@/lib/progress-tracker/activity';

/**
 * GET /api/journey/[id]/activity
 * Read-only: for each stage of the journey, the time of its latest TeachingMessage (or null).
 * Response: { stages: { stageId: string; lastStudiedAt: string | null }[] } in stage order.
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

    return NextResponse.json({
      stages: stageActivity(
        stages.map((s) => s.id),
        latest.map((row) => ({ stageId: row.stageId, at: row._max.createdAt }))
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
