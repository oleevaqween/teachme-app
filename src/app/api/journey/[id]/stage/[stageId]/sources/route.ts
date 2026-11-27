// src/app/api/journey/[id]/stage/[stageId]/sources/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { stageSourceList } from '@/lib/teaching-session-engine/stage-sources';

/**
 * GET /api/journey/[id]/stage/[stageId]/sources
 * Read-only: the stage's sources, built from its content chunks.
 * Response: { documents: { name: string; sections: string[] }[]; web: { title: string }[] }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  try {
    const { id: journeyId, stageId } = await params;

    const stage = await prisma.stage.findFirst({
      where: { id: stageId, journeyId },
      select: { id: true },
    });

    if (!stage) {
      return NextResponse.json(
        { error: 'Stage not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const chunks = await prisma.contentChunk.findMany({
      where: { stageId },
      select: { sourceDocument: true, sourceSection: true },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json(stageSourceList(chunks));
  } catch (error) {
    return handleApiError(error);
  }
}
