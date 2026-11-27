// src/lib/teaching-session-engine/grounding-engine.ts

import type { ContentChunk } from '@/lib/journey-map-generator';
import type { TeachingMessage, MessageSource } from './index';
import { LESSON_STYLE_RULE } from './lesson-style';

export interface GroundedPrompt {
  systemPrompt: string;
  contextChunks: ContentChunk[];
  webSources: WebSource[];
  instructions: string;
}

export interface WebSource {
  title: string;
  url: string;
  content: string;
  retrievedAt: Date;
}

/** Timeout in milliseconds for Tavily web search calls */
const TAVILY_TIMEOUT_MS = 10_000;

/**
 * Wraps a Tavily search call with a timeout using Promise.race.
 * Returns empty array on timeout or error (graceful degradation).
 */
async function searchWithTimeout(
  tavilySearch: (query: string) => Promise<WebSource[]>,
  query: string
): Promise<WebSource[]> {
  const timeoutPromise = new Promise<WebSource[]>((resolve) => {
    setTimeout(() => resolve([]), TAVILY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([tavilySearch(query), timeoutPromise]);
  } catch {
    // Graceful degradation on any error
    return [];
  }
}

/** Optional extras for one lesson request; without them the prompt is exactly as before. */
export interface GroundedPromptOptions {
  /** Web search query to use instead of the learner's message. */
  searchQuery?: string;
  /** Fixed lesson instruction (a button's, or the check's continuation), added after the conversation context. */
  lessonInstruction?: string;
}

/**
 * Builds a grounded prompt by assembling relevant chunks and
 * optionally querying Tavily for supplementary sources.
 *
 * Pure logic for prompt assembly (testable), with Tavily as injected dependency.
 */
export async function buildGroundedPrompt(
  stageChunks: ContentChunk[],
  userMessage: string,
  conversationHistory: TeachingMessage[],
  tavilySearch?: (query: string) => Promise<WebSource[]>,
  options: GroundedPromptOptions = {}
): Promise<GroundedPrompt> {
  let webSources: WebSource[] = [];

  // Always search the web when Tavily is available — it supplements document
  // knowledge with community discussions, real-world examples, and related concepts
  // the uploaded materials may not fully cover.
  if (tavilySearch) {
    webSources = await searchWithTimeout(tavilySearch, options.searchQuery?.trim() || userMessage);
  }

  // Build context section from ALL chunks (Property 10: every chunk must be included)
  const chunkContext = stageChunks
    .map(
      (chunk, idx) =>
        `--- Document Chunk ${idx + 1} [Document: ${chunk.sourceDocument}, Section: ${chunk.sourceSection}] ---\n${chunk.content}`
    )
    .join('\n\n');

  // Build web source context if available
  const webContext =
    webSources.length > 0
      ? '\n\n--- Web Sources ---\n' +
        webSources
          .map(
            (src, idx) =>
              `[Web ${idx + 1}: ${src.title} (${src.url})]\n${src.content}`
          )
          .join('\n\n')
      : '';

  // Anti-hallucination and attribution instructions
  const instructions = [
    'GROUNDING RULES: You MUST follow these strictly:',
    '1. Prioritise facts from the provided document chunks and verified web sources below.',
    '2. If a fact comes from a document chunk, cite it as [Document: <filename>].',
    '3. If a fact comes from a web source, cite it as [Web: <source name>].',
    '4. If a fact comes from your general training knowledge (not from any provided source), label it clearly as [General Knowledge] so the student knows it is not document-sourced.',
    '5. NEVER present invented or hallucinated information as fact. If you are uncertain, say so explicitly.',
    '6. When the topic goes beyond the document but web sources cover it, rely on those web sources and cite them.',
    '7. When neither document nor web sources cover a concept, answer from general knowledge and label it [General Knowledge]. Do NOT refuse to answer.',
    '8. When making inferences or connections between sources, explicitly mark them as inferences.',
    '9. Prefer document-sourced content over web-sourced content when both are available, and both over general knowledge.',
  ].join('\n');

  // Assemble the full system prompt
  const systemPrompt = [
    'You are an expert teaching assistant for an interactive learning journey.',
    'Your responses must be grounded in the provided context materials.',
    '',
    instructions,
    '',
    LESSON_STYLE_RULE,
    '',
    '--- CONTEXT MATERIALS ---',
    chunkContext,
    webContext,
    '',
    '--- CONVERSATION CONTEXT ---',
    `The student has sent ${conversationHistory.length} prior message(s) in this session.`,
    'Continue teaching naturally while maintaining accuracy and proper source attribution.',
    ...(options.lessonInstruction
      ? [
          '',
          '--- LESSON REQUEST ---',
          'Follow this lesson instruction while keeping every grounding rule above:',
          options.lessonInstruction,
        ]
      : []),
  ].join('\n');

  return {
    systemPrompt,
    contextChunks: stageChunks,
    webSources,
    instructions,
  };
}

/**
 * Formats source attributions for display in the UI.
 * Pure function — maps sources to display labels.
 *
 * - Document sources are labeled as "Document: {name}"
 * - Web sources are labeled as "{name} ({url})"
 *
 * Returns an empty string for an empty sources array.
 */
export function formatSourceAttribution(sources: MessageSource[]): string {
  if (sources.length === 0) {
    return '';
  }

  const lines = sources.map((source) => {
    if (source.type === 'document') {
      return `- Document: ${source.name}`;
    }
    return `- ${source.name} (${source.url})`;
  });

  return `Sources:\n${lines.join('\n')}`;
}
