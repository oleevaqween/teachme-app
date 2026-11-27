// src/lib/teaching-session-engine/shared.ts
//
// Client-safe exports — no Node.js-only dependencies.
// This file can be imported from both client components and server code.

import type { Stage } from '@/lib/journey-map-generator';

export interface TeachingMessage {
  id: string;
  stageId: string;
  journeyId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: MessageSource[];
  messageType: 'lecture' | 'qa';
  createdAt: Date;
}

export interface MessageSource {
  type: 'document' | 'web';
  name: string;
  url?: string;
}

export interface SendMessageParams {
  journeyId: string;
  stageId: string;
  message: string;
}

/**
 * Determines if all major topics in a stage have been covered by the conversation.
 * Returns true when the teaching session should offer completion.
 *
 * Heuristic approach:
 * 1. Requires a minimum of 3 assistant messages to ensure engagement
 * 2. Extracts keywords from each topic in stage.topicsCovered
 * 3. Checks if those keywords appear in the combined assistant message content
 * 4. Returns true if >= 80% of topics have keyword matches
 *
 * This is a pure function (no async, no DB calls).
 */
export function assessStageCompletion(
  messages: TeachingMessage[],
  stage: Stage
): boolean {
  const topics = stage.topicsCovered;

  if (!topics || topics.length === 0) {
    return false;
  }

  const assistantMessages = messages.filter((m) => m.role === 'assistant');
  if (assistantMessages.length < 3) {
    return false;
  }

  const combinedContent = assistantMessages
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();

  let coveredCount = 0;

  for (const topic of topics) {
    const keywords = extractKeywords(topic);
    const isCovered = keywords.some((keyword) =>
      combinedContent.includes(keyword.toLowerCase())
    );
    if (isCovered) {
      coveredCount++;
    }
  }

  const coverageRatio = coveredCount / topics.length;
  return coverageRatio >= 0.8;
}

/**
 * Extracts meaningful keywords from a topic string.
 */
function extractKeywords(topic: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'as', 'if', 'not', 'no', 'so', 'up',
    'out', 'about', 'into', 'over', 'after', 'how', 'what', 'when', 'where',
    'who', 'which', 'why', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'than', 'too', 'very',
  ]);

  const words = topic
    .split(/[\s\-_/]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

  if (words.length === 0) {
    return [topic.trim()];
  }

  return words;
}
