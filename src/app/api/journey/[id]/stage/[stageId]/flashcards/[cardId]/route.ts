// src/app/api/journey/[id]/stage/[stageId]/flashcards/[cardId]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { nextReview, parseCardBody, parseReviewBody } from '@/lib/teaching-session-engine/flashcards';
import {
  CARD_FIELDS,
  badRequest,
  flashcardError,
  readJson,
  toCardView,
} from '@/lib/teaching-session-engine/flashcard-store';

type Params = { params: Promise<{ id: string; stageId: string; cardId: string }> };

const cardNotFound = () => NextResponse.json({ error: 'Card not found.', code: 'NOT_FOUND' }, { status: 404 });

/** The card when it belongs to this stage of this journey. */
function cardInStage(journeyId: string, stageId: string, cardId: string) {
  return prisma.flashcard.findFirst({ where: { id: cardId, stageId, journeyId }, select: { id: true, box: true } });
}

/** PATCH: edit the card. Body: { front, back }. Response: { card: CardView } */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: journeyId, stageId, cardId } = await params;
    const parsed = parseCardBody(await readJson(request));
    if (!parsed.ok) return badRequest(parsed.error);
    if (!(await cardInStage(journeyId, stageId, cardId))) return cardNotFound();
    const card = await prisma.flashcard.update({
      where: { id: cardId },
      data: { front: parsed.front, back: parsed.back },
      select: CARD_FIELDS,
    });
    return NextResponse.json({ card: toCardView(card) });
  } catch (error) {
    return flashcardError(error);
  }
}

/** DELETE: remove the card. Response: { deleted: true } */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id: journeyId, stageId, cardId } = await params;
    if (!(await cardInStage(journeyId, stageId, cardId))) return cardNotFound();
    await prisma.flashcard.delete({ where: { id: cardId } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return flashcardError(error);
  }
}

/** POST: record a review. Body: { result: 'again' | 'good' }. Response: { card: CardView } */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: journeyId, stageId, cardId } = await params;
    const result = parseReviewBody(await readJson(request));
    if (!result) return badRequest("Send { result: 'again' | 'good' }.");
    const found = await cardInStage(journeyId, stageId, cardId);
    if (!found) return cardNotFound();
    const now = new Date();
    const next = nextReview(found.box, result, now);
    const card = await prisma.flashcard.update({
      where: { id: cardId },
      data: { box: next.box, dueAt: next.dueAt, lastReviewedAt: now },
      select: CARD_FIELDS,
    });
    return NextResponse.json({ card: toCardView(card) });
  } catch (error) {
    return flashcardError(error);
  }
}
