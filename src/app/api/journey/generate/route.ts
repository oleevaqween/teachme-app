// src/app/api/journey/generate/route.ts

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { validateTopic } from '@/lib/validators/topic';
import { getActiveProviderConfig } from '@/lib/llm/config';
import { generateJourneyMap } from '@/lib/journey-map-generator';
import { handleApiError, PlatformError } from '@/lib/errors';
import type { ParsedDocument } from '@/lib/document-processor';

// Allow large request bodies and long generation times
export const maxDuration = 120; // 2 minutes max for generation

interface GenerateJourneyRequestBody {
  topic?: string;
  documentIds?: string[];
  documents?: ParsedDocument[];
}

/**
 * POST /api/journey/generate
 *
 * Generates an interactive learning journey from a topic and optional document references.
 * Returns a streamed Server-Sent Events response with progress updates and the journey ID on completion.
 *
 * Body:
 *   - topic?: string (3-200 chars, required if no documents provided)
 *   - documentIds?: string[] (IDs of parsed documents saved during upload)
 *   - documents?: ParsedDocument[] (optional, inline parsed documents for backward compat)
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateJourneyRequestBody;

    // 1. Validate: at least a topic or documents must be provided
    const hasTopic = typeof body.topic === 'string' && body.topic.trim().length > 0;
    const hasDocuments =
      (body.documentIds && body.documentIds.length > 0) ||
      (body.documents && body.documents.length > 0);

    if (!hasTopic && !hasDocuments) {
      return NextResponse.json(
        {
          error: 'Please provide a topic or upload documents to generate a journey.',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      );
    }

    // 2. Validate topic if provided
    if (hasTopic) {
      const topicValidation = validateTopic(body.topic!);
      if (!topicValidation.valid) {
        return NextResponse.json(
          { error: topicValidation.error, code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
    }

    // 3. Load active LLM provider
    const providerConfig = await getActiveProviderConfig();
    if (!providerConfig) {
      return NextResponse.json(
        {
          error:
            'No LLM provider configured. Please set up a provider in Settings before generating a journey.',
          code: 'LLM_UNAVAILABLE',
          retryable: false,
        },
        { status: 400 }
      );
    }

    // 4. Resolve documents — load from disk by ID (full content, no truncation)
    let documents: ParsedDocument[] | undefined;

    if (body.documentIds && body.documentIds.length > 0) {
      const parsedDir = path.join(process.cwd(), 'uploads', 'parsed');
      const loadedDocs: ParsedDocument[] = [];

      for (const docId of body.documentIds) {
        try {
          const filePath = path.join(parsedDir, `${docId}.json`);
          const content = await readFile(filePath, 'utf-8');
          loadedDocs.push(JSON.parse(content) as ParsedDocument);
        } catch {
          // Skip documents that can't be loaded (may have been cleaned up)
          console.warn(`Could not load parsed document: ${docId}`);
        }
      }

      if (loadedDocs.length > 0) {
        documents = loadedDocs;
      }
    } else if (body.documents) {
      // Backward compatibility: accept inline documents
      documents = body.documents;
    }

    // 5. Determine topic — use provided topic or derive from documents
    const topic = hasTopic
      ? body.topic!.trim()
      : 'Learning Journey'; // Fallback topic for documents-only mode

    // 6. Create SSE stream with progress events from generateJourneyMap
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const journeyMap = await generateJourneyMap({
            topic,
            documents,
            llmProvider: providerConfig,
            onProgress: (event) => {
              const data = JSON.stringify(event);
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            },
          });

          // Send final event with journey ID so the client can navigate
          const completeEvent = JSON.stringify({
            stage: 'complete',
            message: 'Journey map generated successfully!',
            progress: 100,
            journeyId: journeyMap.id,
            totalStages: journeyMap.totalStages,
            // Include partialJourney for backward compatibility with existing client
            partialJourney: {
              id: journeyMap.id,
              topic: journeyMap.topic,
              totalStages: journeyMap.totalStages,
              createdAt: journeyMap.createdAt,
            },
          });
          controller.enqueue(encoder.encode(`data: ${completeEvent}\n\n`));
          controller.close();
        } catch (error) {
          // Send error event through the stream
          const errorMessage =
            error instanceof PlatformError
              ? error.userMessage
              : error instanceof Error
                ? error.message
                : 'Journey generation failed';

          const errorCode =
            error instanceof PlatformError ? error.code : 'GENERATION_FAILED';

          const retryable =
            error instanceof PlatformError ? error.retryable : true;

          const errorEvent = JSON.stringify({
            stage: 'error',
            message: errorMessage,
            progress: -1,
            error: true,
            code: errorCode,
            retryable,
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          controller.close();
        }
      },
    });

    // 7. Return the stream as a Server-Sent Events response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
