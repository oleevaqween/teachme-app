// src/lib/teaching-session-engine/flashcard-store.ts
//
// Server-only helpers shared by the flashcard routes.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { FLASHCARDS_UNAVAILABLE_MESSAGE, isMissingFlashcardTable, type CardView } from './flashcards';

/** The card fields every response returns. */
export const CARD_FIELDS = { id: true, front: true, back: true, source: true, box: true, dueAt: true } as const;

/** A stored card as the client sees it. */
export function toCardView(card: { id: string; front: string; back: string; source: string; box: number; dueAt: Date }): CardView {
  return { ...card, source: card.source === 'ai' ? 'ai' : 'own', dueAt: card.dueAt.toISOString() };
}

export function stageInJourney(journeyId: string, stageId: string) {
  return prisma.stage.findFirst({ where: { id: stageId, journeyId }, select: { id: true, title: true } });
}

export const stageNotFound = () => NextResponse.json({ error: 'Stage not found.', code: 'NOT_FOUND' }, { status: 404 });

export const badRequest = (error: string) => NextResponse.json({ error, code: 'BAD_REQUEST' }, { status: 400 });

/** A database not yet updated for flashcards gets a plain fix; anything else the usual handling. */
export function flashcardError(error: unknown) {
  if (isMissingFlashcardTable(error)) {
    return NextResponse.json({ error: FLASHCARDS_UNAVAILABLE_MESSAGE, code: 'FLASHCARDS_UNAVAILABLE' }, { status: 503 });
  }
  return handleApiError(error);
}

/** The request body as JSON, or undefined when it is not JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
