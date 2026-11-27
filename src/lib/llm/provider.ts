// src/lib/llm/provider.ts

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

export type ProviderType = 'openai' | 'anthropic' | 'ollama-cloud' | 'ollama-local';

export interface LLMProviderConfig {
  type: ProviderType;
  apiKey?: string; // Required for cloud providers
  baseUrl?: string; // Custom endpoint (Ollama local: http://localhost:11434)
  model: string; // Selected model name
  timeout: number; // Request timeout in ms (default 15000)
}

export interface ProviderValidationResult {
  valid: boolean;
  error?: string;
  availableModels?: string[];
}

/** AI Provider instance type (from Vercel AI SDK) */
export type AIProvider = ReturnType<typeof createOpenAI> | ReturnType<typeof createAnthropic>;

/**
 * Creates an AI SDK provider instance based on configuration.
 * OpenAI and Ollama variants use @ai-sdk/openai with different baseURLs.
 * Anthropic uses @ai-sdk/anthropic.
 */
export function createProvider(config: LLMProviderConfig): AIProvider {
  switch (config.type) {
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });

    case 'anthropic':
      return createAnthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });

    case 'ollama-cloud':
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://ollama.com/v1',
        name: 'ollama-cloud',
      });

    case 'ollama-local':
      return createOpenAI({
        apiKey: 'ollama', // Ollama local doesn't require a real key but the SDK expects a string
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
        name: 'ollama-local',
      });

    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
}

/**
 * Validates provider credentials by issuing a test request.
 * Must complete within 45 seconds for remote providers, 10 seconds for local.
 */
export async function validateProvider(
  config: LLMProviderConfig
): Promise<ProviderValidationResult> {
  const timeoutMs = config.type === 'ollama-local' ? 10000 : 45000;

  try {
    const provider = createProvider(config);
    const model = config.type === 'anthropic'
      ? provider.languageModel(config.model)
      : (provider as ReturnType<typeof createOpenAI>).chat(config.model);

    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await generateText({
        model,
        prompt: 'Say "ok"',
        maxOutputTokens: 128,
        maxRetries: 0,
        abortSignal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // If we get here, provider is valid. Try to list models as well.
    const models = await listModels(config).catch(() => undefined);

    return {
      valid: true,
      availableModels: models,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('abort')) {
        return {
          valid: false,
          error: `Connection timed out after ${timeoutMs / 1000} seconds. The provider may be unavailable.`,
        };
      }

      // Check for auth-related errors
      const message = error.message.toLowerCase();
      if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid api key') || message.includes('authentication')) {
        return {
          valid: false,
          error: 'Invalid API key or authentication failed.',
        };
      }

      // Check for connection errors (common with Ollama local)
      if (message.includes('econnrefused') || message.includes('connect') || message.includes('network')) {
        return {
          valid: false,
          error: `Could not connect to provider at ${config.baseUrl || 'default endpoint'}. Ensure the service is running.`,
        };
      }

      return {
        valid: false,
        error: error.message,
      };
    }

    return {
      valid: false,
      error: 'An unknown error occurred during validation.',
    };
  }
}

/**
 * Retrieves available models from the configured provider.
 * Uses the OpenAI-compatible /models endpoint for all providers.
 */
export async function listModels(config: LLMProviderConfig): Promise<string[]> {
  const timeoutMs = config.type === 'ollama-local' ? 10000 : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let baseUrl: string;
    const headers: Record<string, string> = {};

    switch (config.type) {
      case 'openai':
        baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
        break;
      case 'anthropic':
        // Anthropic doesn't have a standard /models list endpoint
        // Return common models as a fallback
        return getAnthropicModels();
      case 'ollama-cloud':
        baseUrl = config.baseUrl || 'https://ollama.com/v1';
        if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
        break;
      case 'ollama-local':
        baseUrl = config.baseUrl || 'http://localhost:11434/v1';
        break;
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data?: Array<{ id: string }> };

    if (data.data && Array.isArray(data.data)) {
      return data.data.map((m) => m.id);
    }

    return [];
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
      throw new Error(`Timed out while fetching models after ${timeoutMs / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Returns a static list of well-known Anthropic models.
 * Anthropic doesn't provide a /models list endpoint in the same format.
 */
function getAnthropicModels(): string[] {
  return [
    'claude-sonnet-4-20250514',
    'claude-haiku-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];
}
