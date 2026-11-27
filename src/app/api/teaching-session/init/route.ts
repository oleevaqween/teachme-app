// src/app/api/teaching-session/init/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getActiveProviderConfig } from '@/lib/llm/config';
import { generateInitialMessage } from '@/lib/teaching-session-engine';
import { handleApiError } from '@/lib/errors';

/**
 * POST /api/teaching-session/init
 *
 * Generates the initial teaching message when a user first opens a stage.
 * If the stage already has messages, returns a JSON response indicating it's already initialized.
 * Otherwise, streams the initial assistant message via SSE.
 *
 * Body:
 *   - journeyId: string (required)
 *   - stageId: string (required)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { journeyId, stageId } = body;

    // 1. Validate input — both fields are required
    if (!journeyId || typeof journeyId !== 'string') {
      return NextResponse.json(
        { error: 'journeyId is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!stageId || typeof stageId !== 'string') {
      return NextResponse.json(
        { error: 'stageId is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // 2. Check if messages already exist for this stage (skip init if so)
    const existingMessages = await prisma.teachingMessage.findFirst({
      where: { stageId, journeyId },
    });

    if (existingMessages) {
      return NextResponse.json({ alreadyInitialized: true });
    }

    // 3. Get the active LLM provider config
    const providerConfig = await getActiveProviderConfig();
    if (!providerConfig) {
      return NextResponse.json(
        {
          error: 'No LLM provider configured. Please set up a provider in Settings.',
          code: 'LLM_UNAVAILABLE',
          retryable: false,
        },
        { status: 400 }
      );
    }

    // 4. Call generateInitialMessage and return the stream
    const stream = generateInitialMessage(journeyId, stageId, providerConfig);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
