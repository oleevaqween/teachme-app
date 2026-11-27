// src/app/api/settings/provider/route.ts

import { type NextRequest } from 'next/server';
import { getAllProviderConfigs, saveProviderConfig, resolveProviderKey } from '@/lib/llm/config';
import { validateProvider } from '@/lib/llm/provider';
import type { ProviderType } from '@/lib/llm/provider';
import { handleApiError, PlatformError } from '@/lib/errors';
import { localRequest, readBody } from '@/lib/cv-studio/http';

/**
 * GET /api/settings/provider
 * Retrieves all configured providers with masked API keys.
 */
export async function GET() {
  try {
    const configs = await getAllProviderConfigs();
    return Response.json({ providers: configs });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

/**
 * POST /api/settings/provider
 * Configure a new provider. Validates credentials before storing.
 * Body: { type: ProviderType, apiKey?: string, baseUrl?: string, model: string }
 *
 * If validation fails (invalid key), returns 401 and does NOT store the key (Req 9.8).
 */
export async function POST(request: NextRequest) {
  try {
    localRequest(request);
    const body = await readBody(request);

    const { type, apiKey: enteredKey, baseUrl, model } = body as {
      type?: ProviderType;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };

    // Basic input validation
    if (!type) {
      return Response.json(
        { error: 'Provider type is required.', code: 'VALIDATION_ERROR' },
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

    if (!model) {
      return Response.json(
        { error: 'Model selection is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Cloud providers require an API key (except ollama-local). A saved key can
    // be reused only when the provider endpoint has not changed.
    const apiKey = await resolveProviderKey(type, enteredKey, baseUrl);
    if (type !== 'ollama-local' && !apiKey) {
      return Response.json(
        { error: 'API key is required for cloud-based providers.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Validate provider credentials by issuing a test request
    const timeout = type === 'ollama-local' ? 10000 : 15000;
    const validationResult = await validateProvider({
      type,
      apiKey,
      baseUrl,
      model,
      timeout,
    });

    if (!validationResult.valid) {
      // Requirement 9.8: If validation fails, do NOT store the key
      throw new PlatformError(
        validationResult.error || 'Provider validation failed.',
        'LLM_INVALID_KEY',
        validationResult.error || 'Invalid credentials. The API key was not stored.',
        false
      );
    }

    // Validation passed — save the provider config
    const id = await saveProviderConfig({ type, apiKey, baseUrl, model });

    return Response.json({
      success: true,
      id,
      message: 'Provider configured successfully.',
      availableModels: validationResult.availableModels,
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
