// src/app/api/teaching-session/complete/route.ts

import { type NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { completeStage, getJourneyProgress } from '@/lib/progress-tracker';

/**
 * POST /api/teaching-session/complete
 * Marks a stage as completed and returns the updated journey progress.
 * Accepts: { journeyId: string, stageId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { journeyId, stageId } = body;

    // Validate required fields
    if (!journeyId || typeof journeyId !== 'string') {
      return Response.json(
        { error: 'journeyId is required and must be a string.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!stageId || typeof stageId !== 'string') {
      return Response.json(
        { error: 'stageId is required and must be a string.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Mark the stage as completed
    await completeStage(journeyId, stageId);

    // Return the full updated progress state
    const progress = await getJourneyProgress(journeyId);

    return Response.json(progress);
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
