// src/app/api/journey/[id]/stage/[stageId]/messages/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/journey/[id]/stage/[stageId]/messages
 * Loads all TeachingMessage records for the given stage, ordered by createdAt ascending.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  try {
    const { id: journeyId, stageId } = await params;

    // Verify the stage exists and belongs to this journey
    const stage = await prisma.stage.findFirst({
      where: { id: stageId, journeyId },
    });

    if (!stage) {
      return NextResponse.json(
        { error: 'Stage not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Load all messages for this stage, ordered by creation time
    const messages = await prisma.teachingMessage.findMany({
      where: { stageId, journeyId },
      orderBy: { createdAt: 'asc' },
    });

    // Parse the JSON sources field for each message
    const parsed = messages.map((msg) => ({
      id: msg.id,
      stageId: msg.stageId,
      journeyId: msg.journeyId,
      role: msg.role,
      content: msg.content,
      sources: msg.sources ? JSON.parse(msg.sources) : [],
      messageType: (msg.messageType ?? 'qa') as 'lecture' | 'qa',
      createdAt: msg.createdAt,
    }));

    return NextResponse.json({ messages: parsed });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/journey/[id]/stage/[stageId]/messages
 * Removes all messages for the stage (conversation reset).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  try {
    const { id: journeyId, stageId } = await params;

    // Verify the stage exists and belongs to this journey
    const stage = await prisma.stage.findFirst({
      where: { id: stageId, journeyId },
    });

    if (!stage) {
      return NextResponse.json(
        { error: 'Stage not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Delete all messages for this stage
    const result = await prisma.teachingMessage.deleteMany({
      where: { stageId, journeyId },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
