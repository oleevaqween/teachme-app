// src/app/api/journey/[id]/stage/[stageId]/flashcards/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { MAX_CARDS_PER_STAGE, parseCardBody } from '@/lib/teaching-session-engine/flashcards';
import {
  CARD_FIELDS,
  badRequest,
  flashcardError,
  readJson,
  stageInJourney,
  stageNotFound,
  toCardView,
} from '@/lib/teaching-session-engine/flashcard-store';

type Params = { params: Promise<{ id: string; stageId: string }> };

/**
 * GET /api/journey/[id]/stage/[stageId]/flashcards
 * The stage's cards, oldest first. Response: { cards: CardView[] }
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: journeyId, stageId } = await params;
    if (!(await stageInJourney(journeyId, stageId))) return stageNotFound();
    const cards = await prisma.flashcard.findMany({ where: { stageId }, select: CARD_FIELDS, orderBy: { createdAt: 'asc' } });
    return NextResponse.json({ cards: cards.map(toCardView) });
  } catch (error) {
    return flashcardError(error);
  }
}

/**
 * POST /api/journey/[id]/stage/[stageId]/flashcards
 * Adds the learner's own card. Body: { front, back }. Response: { card: CardView }
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: journeyId, stageId } = await params;
    const parsed = parseCardBody(await readJson(request));
    if (!parsed.ok) return badRequest(parsed.error);
    if (!(await stageInJourney(journeyId, stageId))) return stageNotFound();
    if ((await prisma.flashcard.count({ where: { stageId } })) >= MAX_CARDS_PER_STAGE) {
      return NextResponse.json({ error: `A stage can hold up to ${MAX_CARDS_PER_STAGE} cards.`, code: 'TOO_MANY_CARDS' }, { status: 409 });
    }
    const card = await prisma.flashcard.create({
      data: { stageId, journeyId, front: parsed.front, back: parsed.back, source: 'own' },
      select: CARD_FIELDS,
    });
    return NextResponse.json({ card: toCardView(card) });
  } catch (error) {
    return flashcardError(error);
  }
}
