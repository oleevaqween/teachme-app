// src/app/api/journey/[id]/stage/[stageId]/flashcards/generate/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getActiveProviderConfig } from '@/lib/llm/config';
import { AI_CARDS_PER_REQUEST, MAX_CARDS_PER_STAGE, parseGeneratedCards } from '@/lib/teaching-session-engine/flashcards';
import {
  FLASHCARD_CONTEXT_CHARS,
  FLASHCARD_CONTEXT_CHARS_LOCAL,
  flashcardContext,
  flashcardPrompt,
  generateFlashcardText,
} from '@/lib/teaching-session-engine/flashcard-generator';
import { CARD_FIELDS, flashcardError, stageInJourney, stageNotFound, toCardView } from '@/lib/teaching-session-engine/flashcard-store';

/**
 * POST /api/journey/[id]/stage/[stageId]/flashcards/generate
 * Asks the configured AI for up to AI_CARDS_PER_REQUEST cards from the stage's own material and saves the
 * new ones (repeats of existing questions are skipped). Response: { cards: CardView[] } (only the new cards).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  try {
    const { id: journeyId, stageId } = await params;
    const stage = await stageInJourney(journeyId, stageId);
    if (!stage) return stageNotFound();

    const existing = await prisma.flashcard.findMany({ where: { stageId }, select: { front: true }, orderBy: { createdAt: 'asc' } });
    const room = Math.min(AI_CARDS_PER_REQUEST, MAX_CARDS_PER_STAGE - existing.length);
    if (room < 1) {
      return NextResponse.json({ error: `A stage can hold up to ${MAX_CARDS_PER_STAGE} cards.`, code: 'TOO_MANY_CARDS' }, { status: 409 });
    }

    const providerConfig = await getActiveProviderConfig();
    if (!providerConfig) {
      return NextResponse.json(
        { error: 'No LLM provider configured. Please set up a provider in Settings.', code: 'LLM_UNAVAILABLE', retryable: false },
        { status: 400 }
      );
    }

    const chunks = await prisma.contentChunk.findMany({
      where: { stageId },
      select: { content: true, sourceSection: true },
      orderBy: { order: 'asc' },
    });
    const fronts = existing.map((c) => c.front);

    let text: string;
    try {
      const budget = providerConfig.type === 'ollama-local' ? FLASHCARD_CONTEXT_CHARS_LOCAL : FLASHCARD_CONTEXT_CHARS;
      text = await generateFlashcardText(providerConfig, flashcardPrompt(stage.title, flashcardContext(chunks, budget), fronts));
    } catch (error) {
      console.error('Flashcard generation failed:', error);
      return NextResponse.json(
        { error: 'TeachMe could not make cards just now. Please try again.', code: 'LLM_UNAVAILABLE', retryable: true },
        { status: 502 }
      );
    }

    const made = parseGeneratedCards(text, fronts, room);
    if (!made.length) {
      return NextResponse.json(
        { error: "The AI's reply had no cards TeachMe could read. Please try again.", code: 'NO_CARDS', retryable: true },
        { status: 422 }
      );
    }

    // One plain INSERT per card, in order. createMany/createManyAndReturn run inside a transaction, which leaks
    // a connection with the libsql adapter in use (checked with query logging); single creates do not.
    const cards = [];
    for (const card of made) {
      cards.push(
        await prisma.flashcard.create({ data: { stageId, journeyId, front: card.front, back: card.back, source: 'ai' }, select: CARD_FIELDS })
      );
    }
    return NextResponse.json({ cards: cards.map(toCardView) });
  } catch (error) {
    return flashcardError(error);
  }
}
