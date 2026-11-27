// src/app/api/journey/[id]/progress/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { getJourneyProgress } from '@/lib/progress-tracker';

/**
 * GET /api/journey/[id]/progress
 * Returns the full progress state for a journey including stage statuses,
 * completed count, total stages, and percent complete.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify the journey exists
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

    const progress = await getJourneyProgress(id);

    return NextResponse.json(progress);
  } catch (error) {
    return handleApiError(error);
  }
}
