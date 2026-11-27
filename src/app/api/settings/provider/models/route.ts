// src/app/api/settings/provider/models/route.ts

import { type NextRequest } from 'next/server';
import { listModels } from '@/lib/llm/provider';
import type { ProviderType } from '@/lib/llm/provider';
import { handleApiError, PlatformError } from '@/lib/errors';
import { z } from 'zod';
import { resolveProviderKey } from '@/lib/llm/config';
import { localRequest, readBody } from '@/lib/cv-studio/http';

/**
 * POST /api/settings/provider/models — credentials never enter URL logs.
 * Lists available models for the specified provider.
 */
export async function POST(request: NextRequest) {
  try {
    localRequest(request);
    const body = z.object({ type: z.enum(['openai', 'anthropic', 'ollama-cloud', 'ollama-local']), apiKey: z.string().max(2000).optional(), baseUrl: z.string().max(2000).optional() }).parse(await readBody(request));
    const { type, baseUrl } = body;
    const apiKey = await resolveProviderKey(type, body.apiKey, baseUrl);

    if (!type) {
      return Response.json(
        { error: 'Provider type query parameter is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const validTypes: ProviderType[] = ['openai', 'anthropic', 'ollama-cloud', 'ollama-local'];
    if (!validTypes.includes(type)) {
      return Response.json(
        { error: `Invalid provider type. Must be one of: ${validTypes.join(', ')}`, code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Cloud providers require API key to list models (except ollama-local)
    if (!['ollama-local', 'ollama-cloud'].includes(type) && !apiKey) {
      return Response.json(
        { error: 'API key is required to list models for cloud-based providers.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const timeout = type === 'ollama-local' ? 10000 : 15000;

    const models = await listModels({
      type,
      apiKey,
      baseUrl,
      model: '', // Not needed for listing models
      timeout,
    });

    return Response.json({ models }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Handle timeout or connection errors from listModels
      if (error.message.includes('Timed out') || error.message.includes('connect')) {
        return handleApiError(
          new PlatformError(
            error.message,
            'LLM_TIMEOUT',
            error.message,
            true
          )
        );
      }

      return handleApiError(
        new PlatformError(
          error.message,
          'LLM_UNAVAILABLE',
          `Failed to retrieve models: ${error.message}`,
          true
        )
      );
    }
    return handleApiError(error);
  }
}
