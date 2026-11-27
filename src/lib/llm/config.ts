// src/lib/llm/config.ts

import { prisma } from '@/lib/db/client';
import type { LLMProviderConfig, ProviderType } from './provider';

/** Reuse a saved key only for its existing destination. Never return it to the browser. */
export async function resolveProviderKey(type: ProviderType, entered?: string, baseUrl?: string): Promise<string | undefined> {
  if (entered?.trim()) return entered.trim();
  if (type === 'ollama-local') return undefined;
  const stored = await prisma.lLMProviderSettings.findFirst({ where: { type } });
  const defaults = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1', 'ollama-cloud': 'https://ollama.com/v1' };
  const normalize = (value?: string | null) => (value || defaults[type]).replace(/\/+$/, '');
  if (stored?.apiKey && normalize(stored.baseUrl) === normalize(baseUrl)) return stored.apiKey;
  return undefined;
}

/**
 * Loads the active LLM provider configuration from the database.
 * Returns null if no provider is configured or active.
 */
export async function getActiveProviderConfig(): Promise<LLMProviderConfig | null> {
  const settings = await prisma.lLMProviderSettings.findFirst({
    where: { isActive: true },
  });

  if (!settings) {
    return null;
  }

  return {
    type: settings.type as ProviderType,
    apiKey: settings.apiKey ?? undefined,
    baseUrl: settings.baseUrl ?? undefined,
    model: settings.model,
    timeout: getDefaultTimeout(settings.type as ProviderType),
  };
}

/**
 * Saves provider settings to the database.
 * Deactivates any other active provider before activating the new one.
 */
export async function saveProviderConfig(config: {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}): Promise<string> {
  // Deactivate all existing providers
  await prisma.lLMProviderSettings.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // Create or update the provider settings
  const existing = await prisma.lLMProviderSettings.findFirst({
    where: { type: config.type },
  });

  if (existing) {
    await prisma.lLMProviderSettings.update({
      where: { id: existing.id },
      data: {
        apiKey: config.apiKey ?? null,
        baseUrl: config.baseUrl ?? null,
        model: config.model,
        isActive: true,
      },
    });
    return existing.id;
  }

  const created = await prisma.lLMProviderSettings.create({
    data: {
      type: config.type,
      apiKey: config.apiKey ?? null,
      baseUrl: config.baseUrl ?? null,
      model: config.model,
      isActive: true,
    },
  });

  return created.id;
}

/**
 * Retrieves all configured provider settings (API keys are masked).
 */
export async function getAllProviderConfigs(): Promise<
  Array<{
    id: string;
    type: ProviderType;
    hasApiKey: boolean;
    baseUrl: string | null;
    model: string;
    isActive: boolean;
  }>
> {
  const settings = await prisma.lLMProviderSettings.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  return settings.map((s) => ({
    id: s.id,
    type: s.type as ProviderType,
    hasApiKey: !!s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    isActive: s.isActive,
  }));
}

/**
 * Deletes a provider configuration by ID.
 */
export async function deleteProviderConfig(id: string): Promise<void> {
  await prisma.lLMProviderSettings.delete({
    where: { id },
  });
}

/**
 * Returns the default timeout for a given provider type.
 * Cloud providers: 15s, Local: 10s.
 */
function getDefaultTimeout(type: ProviderType): number {
  return type === 'ollama-local' ? 10000 : 15000;
}
