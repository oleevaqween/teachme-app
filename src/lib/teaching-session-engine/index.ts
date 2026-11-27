// src/lib/teaching-session-engine/index.ts

import { streamText } from 'ai';
import { randomUUID } from 'node:crypto';
import { createProvider, type LLMProviderConfig } from '@/lib/llm/provider';
import { prisma } from '@/lib/db/client';
import { buildGroundedPrompt, type WebSource } from './grounding-engine';
import type { ContentChunk } from '@/lib/journey-map-generator';
import { searchWeb } from '@/lib/information-validator/web-search';
import { detectMessageIntent } from './intent-detector';
import { formatTeachingStreamError } from './stream-protocol';
import { LESSON_STYLE_RULE, removeEmDashes } from './lesson-style';
import { CHECK_CONTINUE_INSTRUCTION, checkInProgress, lessonActionInstruction, type LessonAction } from './lesson-actions';

// Re-export shared types and functions for server-side consumers
export { assessStageCompletion } from './shared';
export type { TeachingMessage, MessageSource, SendMessageParams } from './shared';
import type { TeachingMessage, MessageSource } from './shared';

export interface SendMessageParamsWithProvider {
  journeyId: string;
  stageId: string;
  message: string;
  messageId?: string;
  llmProvider: LLMProviderConfig;
  /** A lesson button; `message` is then its visible line. */
  action?: LessonAction;
  /** The learner's target role, used only by the 'work' action. */
  role?: string;
  /** The stage title: the web search query for a button request or a check answer; other messages search with themselves. */
  stageTitle?: string;
}

/**
 * Wraps the Tavily search into the format expected by the grounding engine.
 * Returns a function that accepts a query and returns WebSource[].
 */
function createTavilySearchFn(): (query: string) => Promise<WebSource[]> {
  return async (query: string): Promise<WebSource[]> => {
    const results = await searchWeb(query, { maxResults: 5 });
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.snippet,
      retrievedAt: new Date(),
    }));
  };
}

/**
 * Extracts source attributions from an assistant message by parsing
 * [Document: ...] and [Web: ...] citation markers in the response text.
 */
function extractSourcesFromResponse(
  responseText: string,
  chunks: ContentChunk[],
  webSources: WebSource[]
): MessageSource[] {
  const sources: MessageSource[] = [];
  const seen = new Set<string>();

  // Extract document citations: [Document: filename] or [Doc: filename]
  const docMatches = responseText.matchAll(/\[(?:Document|Doc):\s*([^\]]+)\]/gi);
  for (const match of docMatches) {
    const name = match[1].trim();
    if (!seen.has(`doc:${name}`)) {
      seen.add(`doc:${name}`);
      sources.push({ type: 'document', name });
    }
  }

  // Extract web citations: [Web: source name]
  const webMatches = responseText.matchAll(/\[Web:\s*([^\]]+)\]/gi);
  for (const match of webMatches) {
    const name = match[1].trim();
    if (!seen.has(`web:${name}`)) {
      seen.add(`web:${name}`);
      // Try to find the URL from the web sources used in the prompt
      const matchedSource = webSources.find(
        (ws) => ws.title.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(ws.title.toLowerCase())
      );
      sources.push({
        type: 'web',
        name,
        url: matchedSource?.url,
      });
    }
  }

  // If no explicit citations found but we have chunks, attribute to document sources
  if (sources.length === 0 && chunks.length > 0) {
    const uniqueDocs = [...new Set(chunks.map((c) => c.sourceDocument))];
    for (const doc of uniqueDocs.slice(0, 3)) {
      sources.push({ type: 'document', name: doc });
    }
  }

  return sources;
}

/**
 * Processes a user message and returns a streaming response.
 * Handles grounding, context assembly, and source attribution.
 *
 * Flow:
 * 1. Load stage chunks from DB
 * 2. Load conversation history for the stage
 * 3. Persist the user's question before any external AI work
 * 4. Build a grounded prompt and call the configured provider
 * 5. Stream the response to the client
 * 6. Persist the completed assistant response
 */
export function createTeachingStream(
  params: SendMessageParamsWithProvider
): ReadableStream<Uint8Array> {
  const { journeyId, stageId, message, llmProvider, action } = params;
  const messageId = params.messageId ?? randomUUID();

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let userMessageSaved = false;
      try {
        // 1. Load stage chunks from DB
        const dbChunks = await prisma.contentChunk.findMany({
          where: { stageId },
          orderBy: { order: 'asc' },
        });

        const stageChunks: ContentChunk[] = dbChunks.map((chunk) => ({
          id: chunk.id,
          stageId: chunk.stageId,
          journeyId: chunk.journeyId,
          content: chunk.content,
          sourceDocument: chunk.sourceDocument,
          sourceSection: chunk.sourceSection,
          order: chunk.order,
          wordCount: chunk.wordCount,
        }));

        // 2. Load conversation history for the stage
        const dbMessages = await prisma.teachingMessage.findMany({
          where: { stageId, journeyId },
          orderBy: { createdAt: 'asc' },
        });

        const conversationHistory: TeachingMessage[] = dbMessages.map((msg) => ({
          id: msg.id,
          stageId: msg.stageId,
          journeyId: msg.journeyId,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          sources: msg.sources ? JSON.parse(msg.sources) : [],
          messageType: (msg.messageType ?? 'qa') as 'lecture' | 'qa',
          createdAt: msg.createdAt,
        }));

        // 3. Save the question before web search or provider work. If either
        // fails, the learner's input remains recoverable in the conversation.
        await prisma.teachingMessage.create({
          data: {
            id: messageId,
            stageId,
            journeyId,
            role: 'user',
            content: message,
            sources: null,
            messageType: 'qa',
          },
        });
        userMessageSaved = true;

        // 4. Build grounded prompt with Tavily search capability. A button adds its fixed
        // instruction; a plain message during a check (an answer, "ok" or "continue") adds
        // the check's continuation, decided from the saved history alone.
        const continuingCheck = !action && checkInProgress(conversationHistory);
        const tavilySearch = createTavilySearchFn();
        const groundedPrompt = await buildGroundedPrompt(
          stageChunks,
          message,
          conversationHistory,
          tavilySearch,
          action || continuingCheck
            ? {
                searchQuery: params.stageTitle,
                lessonInstruction: action
                  ? lessonActionInstruction(action, params.role)
                  : CHECK_CONTINUE_INSTRUCTION,
              }
            : {}
        );

        // 5. Create LLM provider and call streamText
        const provider = createProvider(llmProvider);
        const model = llmProvider.type === 'anthropic'
          ? provider.languageModel(llmProvider.model)
          : (provider as ReturnType<typeof import('@ai-sdk/openai').createOpenAI>).chat(llmProvider.model);

        // Build messages array from conversation history
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
        for (const msg of conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
        // Add the current user message
        messages.push({ role: 'user', content: message });

        let streamError: unknown;
        const result = streamText({
          model,
          system: groundedPrompt.systemPrompt,
          messages,
          maxRetries: 1,
          onError: ({ error }) => {
            streamError = error;
          },
        });

        // 6. Pipe text to the client while retaining the completed answer for
        // persistence. AI SDK stream errors can be reported via onError without
        // throwing from the iterator, so check both paths.
        let assistantText = '';
        for await (const chunk of result.textStream) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        if (streamError) throw streamError;
        const completedText = assistantText.trim();
        if (!completedText) throw new Error('The AI provider returned an empty response.');

        const sources = extractSourcesFromResponse(
          completedText,
          stageChunks,
          groundedPrompt.webSources
        );

        await prisma.teachingMessage.create({
          data: {
            stageId,
            journeyId,
            role: 'assistant',
            // Any em dash the AI still wrote is replaced before saving (see lesson-style.ts).
            content: removeEmDashes(completedText),
            sources: JSON.stringify(sources),
            // Button replies and replies during a check answer a request, so they are never lecture cards.
            messageType: action || continuingCheck ? 'qa' : detectMessageIntent(message),
          },
        });

        controller.close();
      } catch (error) {
        console.error('Teaching response failed:', error);
        const errorMessage = userMessageSaved
          ? 'Your question was saved, but TeachMe could not complete the answer. Please try again.'
          : 'TeachMe could not save or answer your question. Please try again.';
        controller.enqueue(encoder.encode(formatTeachingStreamError(errorMessage)));
        controller.close();
      }
    },
  });
}

/**
 * Generates the initial teaching message when a user first opens a stage.
 * Loads stage data and chunks, builds a prompt instructing the LLM to introduce
 * the stage theme and begin teaching the first concept, then streams the response
 * and persists it as the first assistant message.
 */
export function generateInitialMessage(
  journeyId: string,
  stageId: string,
  llmProvider: LLMProviderConfig
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1. Load stage data
        const stage = await prisma.stage.findFirst({
          where: { id: stageId, journeyId },
        });

        if (!stage) {
          controller.enqueue(encoder.encode('[Error: Stage not found]'));
          controller.close();
          return;
        }

        // 2. Load stage chunks for context
        const dbChunks = await prisma.contentChunk.findMany({
          where: { stageId },
          orderBy: { order: 'asc' },
        });

        const stageChunks: ContentChunk[] = dbChunks.map((chunk) => ({
          id: chunk.id,
          stageId: chunk.stageId,
          journeyId: chunk.journeyId,
          content: chunk.content,
          sourceDocument: chunk.sourceDocument,
          sourceSection: chunk.sourceSection,
          order: chunk.order,
          wordCount: chunk.wordCount,
        }));

        // 3. Parse topics covered
        const topicsCovered: string[] = stage.topicsCovered
          ? JSON.parse(stage.topicsCovered)
          : [];

        // 4. Build system prompt for initial teaching message
        const chunkContext = stageChunks
          .map((c, i) => `[Source ${i + 1}: ${c.sourceDocument} - ${c.sourceSection}]\n${c.content}`)
          .join('\n\n');

        const systemPrompt = `You are an engaging and knowledgeable teacher guiding a student through a learning journey.

You are introducing a new stage of the journey. Here is the stage information:
- Stage Title: ${stage.title}
- Stage Theme: ${stage.theme}
- Stage Summary: ${stage.summary}
- Topics to Cover: ${topicsCovered.join(', ')}

Here is the reference content for this stage:
${chunkContext || '(No specific reference content available - use your knowledge)'}

Instructions:
- Warmly introduce this stage's theme and what the student will learn
- Begin teaching the first concept from the topics list
- Be conversational and encouraging
- Use examples and analogies where helpful
- Keep your introduction concise but informative (aim for 150-300 words)
- End with a question or prompt that invites the student to engage
- If referencing specific content from the sources, cite it naturally (e.g., "According to [Document: filename]...")
- ${LESSON_STYLE_RULE}`;

        // 5. Create LLM provider and stream
        const provider = createProvider(llmProvider);
        const model = llmProvider.type === 'anthropic'
          ? provider.languageModel(llmProvider.model)
          : (provider as ReturnType<typeof import('@ai-sdk/openai').createOpenAI>).chat(llmProvider.model);

        const result = streamText({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: 'Please introduce this stage and begin teaching.' }],
          maxRetries: 1,
          onFinish: async ({ text }) => {
            try {
              // Extract sources from the response
              const sources: MessageSource[] = [];
              const uniqueDocs = [...new Set(stageChunks.map((c) => c.sourceDocument))];
              for (const doc of uniqueDocs.slice(0, 3)) {
                sources.push({ type: 'document', name: doc });
              }

              await prisma.teachingMessage.create({
                data: {
                  stageId,
                  journeyId,
                  role: 'assistant',
                  content: removeEmDashes(text),
                  sources: JSON.stringify(sources),
                  messageType: 'lecture',
                },
              });
            } catch (persistError) {
              console.error('Failed to persist initial teaching message:', persistError);
            }
          },
        });

        // 6. Pipe the text stream to the controller
        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      } catch (error) {
        console.error('Initial teaching response failed:', error);
        controller.enqueue(encoder.encode(formatTeachingStreamError(
          'TeachMe could not generate the opening lesson. Please try again.'
        )));
        controller.close();
      }
    },
  });
}


