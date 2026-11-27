// src/app/api/teaching-session/message/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveProviderConfig } from '@/lib/llm/config';
import { createTeachingStream } from '@/lib/teaching-session-engine';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { LESSON_ACTIONS, MAX_ROLE_LENGTH, cleanRole, lessonActionLine, typedLessonAction } from '@/lib/teaching-session-engine/lesson-actions';

/**
 * Zod schema for validating the POST request body.
 * journeyId, stageId and a non-empty message are required. An optional lesson
 * `action` must be one of LESSON_ACTIONS; `role` is used only by 'work'.
 */
const SendMessageSchema = z.object({
  journeyId: z.string().min(1, 'journeyId is required'),
  stageId: z.string().min(1, 'stageId is required'),
  message: z.string().min(1, 'message must be non-empty'),
  messageId: z.string().min(1).max(120).optional(),
  action: z.enum(LESSON_ACTIONS, { error: 'Unknown lesson action.' }).optional(),
  role: z.string().max(MAX_ROLE_LENGTH).optional(),
});

/**
 * POST /api/teaching-session/message
 *
 * Sends a user message within a teaching session and returns a streaming
 * response (text/event-stream) with the assistant's reply tokens.
 *
 * Body:
 *   - journeyId: string (required)
 *   - stageId: string (required)
 *   - message: string (required, non-empty; with an action the server saves the action's own line instead)
 *   - action: 'simpler' | 'example' | 'steps' | 'work' | 'check' (optional)
 *   - role: string (optional; only the 'work' action uses it)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate input with Zod
    const parseResult = SendMessageSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return NextResponse.json(
        {
          error: firstError.message,
          code: 'VALIDATION_ERROR',
          retryable: false,
        },
        { status: 400 }
      );
    }

    const { journeyId, stageId, message, messageId } = parseResult.data;
    // A typed message that is a button's line counts as that button, so a check typed by hand starts properly.
    const typed = parseResult.data.action ? null : typedLessonAction(message);
    const action = parseResult.data.action ?? typed?.action;
    const role = action === 'work' ? cleanRole(typed?.role ?? parseResult.data.role) : '';

    // 2. Verify the stage exists and belongs to the journey
    const stage = await prisma.stage.findFirst({
      where: { id: stageId, journeyId },
      select: { id: true, title: true },
    });

    if (!stage) {
      return NextResponse.json(
        {
          error: 'Stage not found for this journey.',
          code: 'STAGE_NOT_FOUND',
          retryable: false,
        },
        { status: 404 }
      );
    }

    // 3. Get the active LLM provider configuration
    const providerConfig = await getActiveProviderConfig();
    if (!providerConfig) {
      return NextResponse.json(
        {
          error:
            'No LLM provider configured. Please set up a provider in Settings before starting a teaching session.',
          code: 'LLM_UNAVAILABLE',
          retryable: false,
        },
        { status: 400 }
      );
    }

    // 4. Create the teaching stream
    // A lesson button saves its own short line, whatever text the client sent.
    // The stage title is the search query for button requests and check answers only.
    const stream = createTeachingStream({
      journeyId,
      stageId,
      message: action ? lessonActionLine(action, role) : message,
      messageId,
      llmProvider: providerConfig,
      stageTitle: stage.title,
      ...(action ? { action, role } : {}),
    });

    // 5. Return the stream as a text/event-stream response
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
