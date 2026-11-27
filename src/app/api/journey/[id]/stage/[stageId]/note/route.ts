// src/app/api/journey/[id]/stage/[stageId]/note/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import {
  NOTES_UNAVAILABLE_MESSAGE,
  isMissingNotesTable,
  parseNoteBody,
} from '@/lib/teaching-session-engine/stage-note';

type Params = { params: Promise<{ id: string; stageId: string }> };

const NOTE_FIELDS = { content: true, updatedAt: true } as const;

function stageNotFound() {
  return NextResponse.json({ error: 'Stage not found.', code: 'NOT_FOUND' }, { status: 404 });
}

/** Notes errors: a database not yet updated for notes gets a plain fix; anything else the usual handling. */
function noteError(error: unknown) {
  if (isMissingNotesTable(error)) {
    return NextResponse.json({ error: NOTES_UNAVAILABLE_MESSAGE, code: 'NOTES_UNAVAILABLE' }, { status: 503 });
  }
  return handleApiError(error);
}

async function stageInJourney(journeyId: string, stageId: string) {
  return prisma.stage.findFirst({ where: { id: stageId, journeyId }, select: { id: true } });
}

/**
 * GET /api/journey/[id]/stage/[stageId]/note
 * The learner's note for the stage. Response: { content: string; updatedAt: string | null }
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: journeyId, stageId } = await params;
    if (!(await stageInJourney(journeyId, stageId))) return stageNotFound();

    const note = await prisma.stageNote.findUnique({ where: { stageId }, select: NOTE_FIELDS });
    return NextResponse.json({
      content: note?.content ?? '',
      updatedAt: note ? note.updatedAt.toISOString() : null,
    });
  } catch (error) {
    return noteError(error);
  }
}

/**
 * PUT /api/journey/[id]/stage/[stageId]/note
 * Body: { content: string } (at most MAX_NOTE_LENGTH characters). Saves the note exactly as typed;
 * a note of only spaces is removed. Response: { content: string; updatedAt: string | null }
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id: journeyId, stageId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Send the note as JSON.', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const parsed = parseNoteBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: 'BAD_REQUEST' }, { status: 400 });

    if (!(await stageInJourney(journeyId, stageId))) return stageNotFound();

    if (!parsed.content.trim()) {
      await prisma.stageNote.deleteMany({ where: { stageId } });
      return NextResponse.json({ content: '', updatedAt: null });
    }

    const note = await prisma.stageNote.upsert({
      where: { stageId },
      create: { stageId, journeyId, content: parsed.content },
      update: { content: parsed.content },
      select: NOTE_FIELDS,
    });
    return NextResponse.json({ content: note.content, updatedAt: note.updatedAt.toISOString() });
  } catch (error) {
    return noteError(error);
  }
}
