// src/lib/teaching-session-engine/flashcard-generator.ts
//
// Server-only: asks the configured AI for question-and-answer cards from a stage's own material.

import { generateText } from 'ai';
import type { createOpenAI } from '@ai-sdk/openai';
import { createProvider, type LLMProviderConfig } from '@/lib/llm/provider';
import { AI_CARDS_PER_REQUEST } from './flashcards';
import { removeEmDashes } from './lesson-style';

/** Most characters of stage material put in the prompt, spread across the stage's chunks. */
export const FLASHCARD_CONTEXT_CHARS = 12_000;
/** A smaller budget for a local model, whose default context window is small and is cut from the front. */
export const FLASHCARD_CONTEXT_CHARS_LOCAL = 5_000;
/** Existing questions listed to avoid repeats: the most recent ones, each cut short. */
export const AVOID_LIST_MAX = 20;
export const AVOID_ITEM_CHARS = 120;
/** Generation gives up after the provider's own timeout, and never sooner than this. */
export const FLASHCARD_MIN_TIMEOUT_MS = 120_000;

/** The stage material for the prompt: chunks in order, each cut so the whole fits `budget` characters. */
export function flashcardContext(
  chunks: readonly { content: string; sourceSection: string }[],
  budget: number = FLASHCARD_CONTEXT_CHARS
): string {
  if (!chunks.length) return '';
  const each = Math.max(300, Math.floor(budget / chunks.length));
  let out = '';
  for (const chunk of chunks) {
    const piece = `[${chunk.sourceSection}]\n${chunk.content.slice(0, each)}\n\n`;
    if (out.length + piece.length > budget) break;
    out += piece;
  }
  return out.trim();
}

/**
 * The system prompt: plain Q/A lines (easy for every model, including small local ones), only from the material.
 * The format rules come after the material, so a model that drops the start of a long prompt still keeps them.
 */
export function flashcardPrompt(stageTitle: string, context: string, existingFronts: readonly string[]): string {
  const recent = existingFronts.slice(-AVOID_LIST_MAX).map((f) => (f.length > AVOID_ITEM_CHARS ? `${f.slice(0, AVOID_ITEM_CHARS)}…` : f));
  const avoid = recent.length
    ? `\nThe student already has cards with these questions; do not repeat them:\n${recent.map((f) => `- ${f}`).join('\n')}\n`
    : '';
  return `You write study flashcards for the stage "${stageTitle}".

Material:
${context || '(No material available.)'}
${avoid}
Write ${AI_CARDS_PER_REQUEST} flashcards that test the most important ideas in the material above.
Rules:
- Take every card only from the material above; do not add outside facts.
- One idea per card. The question is short and clear; the answer is one to three sentences.
- Write each card as two lines exactly like this, with a blank line between cards:
Q: the question
A: the answer
- Write nothing else: no title, no numbering, no closing remarks.
- Do not use em dashes.`;
}

/** Calls the configured AI once and returns its text. */
export async function generateFlashcardText(llm: LLMProviderConfig, system: string): Promise<string> {
  const provider = createProvider(llm);
  const model =
    llm.type === 'anthropic'
      ? provider.languageModel(llm.model)
      : (provider as ReturnType<typeof createOpenAI>).chat(llm.model);
  const result = await generateText({
    model,
    system,
    prompt: 'Write the flashcards now.',
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(Math.max(llm.timeout ?? 0, FLASHCARD_MIN_TIMEOUT_MS)),
  });
  return removeEmDashes(result.text);
}
