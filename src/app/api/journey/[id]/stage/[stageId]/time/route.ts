// src/app/api/journey/[id]/stage/[stageId]/time/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { MIN_SECONDS_FOR_LAST_STUDIED, isMissingStudyTimeTable, parseTimeBody } from '@/lib/progress-tracker/study-time';

/**
 * POST /api/journey/[id]/stage/[stageId]/time
 * Body: { seconds } (whole number, 1 to MAX_INCREMENT_SECONDS). Adds the seconds to the stage's study time;
 * MIN_SECONDS_FOR_LAST_STUDIED or more also sets lastStudiedAt to now.
 * Response: { seconds: number } (the new total).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  try {
    const { id: journeyId, stageId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Send { seconds } as JSON.', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const parsed = parseTimeBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: 'BAD_REQUEST' }, { status: 400 });

    const stage = await prisma.stage.findFirst({ where: { id: stageId, journeyId }, select: { id: true } });
    if (!stage) return NextResponse.json({ error: 'Stage not found.', code: 'NOT_FOUND' }, { status: 404 });

    // Only a real stretch of study marks the stage as last studied; a brief peek just adds its seconds.
    const studied = parsed.seconds >= MIN_SECONDS_FOR_LAST_STUDIED ? { lastStudiedAt: new Date() } : {};
    const total = await prisma.stageStudyTime.upsert({
      where: { stageId },
      create: { stageId, journeyId, seconds: parsed.seconds, ...studied },
      update: { seconds: { increment: parsed.seconds }, ...studied },
      select: { seconds: true },
    });
    return NextResponse.json({ seconds: total.seconds });
  } catch (error) {
    if (isMissingStudyTimeTable(error)) {
      return NextResponse.json(
        { error: 'Study time needs a quick database update: run npm run db:setup.', code: 'STUDY_TIME_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return handleApiError(error);
  }
}
