// src/lib/journey-map-generator/stage-generator.ts

import { generateText } from 'ai';
import { randomUUID } from 'crypto';
import { createProvider, type LLMProviderConfig } from '@/lib/llm/provider';
import { PlatformError } from '@/lib/errors';
import type { Stage } from './index';
import type { PooledContentSection } from './content-pool';
import type { ContentSection } from '@/lib/document-processor';

/**
 * Raw stage structure returned by the LLM before we add generated metadata.
 */
interface LLMStageResponse {
  title: string;
  summary: string;
  theme: string;
  topicsCovered: string[];
}

/**
 * Progress callback type for reporting generation status to the user.
 */
type ProgressCallback = (message: string) => void;

/**
 * The system prompt instructing the LLM on how to generate stages.
 */
const STAGE_GENERATION_SYSTEM_PROMPT = `You are an expert curriculum designer who creates engaging, creative learning journeys. Your task is to organize educational content into themed stages that feel like stops on an adventure — NOT a textbook table of contents.

**Rules:**
1. Create between 10 and 15 stages (inclusive).
2. Each stage must have a creative theme — use analogies, narratives, progressive complexity, or real-world scenarios.
3. The stage order MUST differ from the source document's table of contents. Reorganize topics creatively (e.g., by analogy, narrative arc, difficulty progression, interconnection).
4. Every topic/concept from the source content must appear in at least one stage's topicsCovered array.
5. Each stage summary must be between 20 and 80 words.
6. Stages should flow naturally as a learning journey — earlier stages build foundations, later stages tackle advanced or synthesis topics.

**Output Format:**
Return ONLY valid JSON (no markdown code blocks, no extra text) in this exact structure:
{
  "stages": [
    {
      "title": "Creative stage title",
      "summary": "A 20-80 word summary describing what this stage covers and its theme",
      "theme": "A short theme label (e.g., 'The Foundation', 'Deep Dive', 'Real-World Arena')",
      "topicsCovered": ["topic1", "topic2", "topic3"]
    }
  ]
}`;

/**
 * Generates themed learning stages from a content pool using an LLM.
 *
 * Architecture (inspired by NotebookLM / RAG patterns):
 * - Only sends section TITLES to the LLM (lightweight, fast)
 * - The LLM organizes titles into creative themed stages
 * - Full document content is preserved in ContentChunks and used at teaching time
 * - Chunk-to-stage assignment uses keyword matching (no LLM needed)
 *
 * This keeps generation fast (single LLM call, ~10-20K tokens max)
 * regardless of document size.
 *
 * @param contentPool - Array of content sections to organize into stages
 * @param topic - The learning topic/goal provided by the user
 * @param llmProvider - LLM provider configuration
 * @param journeyId - Optional journey ID to assign to generated stages
 * @param onProgress - Optional callback to report progress messages to the user
 * @returns Array of validated Stage objects with sequential ordering
 */
export async function generateStages(
  contentPool: (PooledContentSection | ContentSection)[],
  topic: string,
  llmProvider: LLMProviderConfig,
  journeyId: string = '',
  onProgress?: ProgressCallback
): Promise<Stage[]> {
  const provider = createProvider(llmProvider);
  const model =
    llmProvider.type === 'anthropic'
      ? provider.languageModel(llmProvider.model)
      : (provider as ReturnType<typeof import('@ai-sdk/openai').createOpenAI>).chat(llmProvider.model);

  const generationTimeout = Math.max(llmProvider.timeout, 300000);

  onProgress?.('Organizing your content into themed learning stages...');

  // Build a titles-only prompt — fast and lightweight
  const prompt = buildTitlesPrompt(contentPool, topic);
  console.log(`[stage-generator] Generating stages from ${contentPool.length} section titles (est. ${Math.ceil(prompt.length / 4)} tokens)`);

  let stages: LLMStageResponse[];

  try {
    stages = await attemptStageGeneration(model, prompt, generationTimeout);
  } catch (error) {
    console.error('[stage-generator] Stage generation failed:', error);
    throw new PlatformError(
      `Stage generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'LLM_UNAVAILABLE',
      'The AI provider could not generate learning stages. Please check your provider settings and try again.\n\nIf the issue persists, check your terminal for detailed error logs.',
      true
    );
  }

  // If validation fails (count outside 10-15), retry once
  if (stages.length < 10 || stages.length > 15) {
    onProgress?.('Refining stage structure...');
    const retryPrompt = buildRetryPrompt(contentPool, topic, stages.length);
    try {
      const retryStages = await attemptStageGeneration(model, retryPrompt, generationTimeout);
      if (retryStages.length >= 10 && retryStages.length <= 15) {
        stages = retryStages;
      }
    } catch {
      // Keep whatever we got from the first attempt
    }
  }

  // If still no valid stages, throw
  if (stages.length === 0) {
    throw new PlatformError(
      'LLM failed to generate valid stages',
      'LLM_UNAVAILABLE',
      'The AI provider returned an invalid response. Please try again.',
      true
    );
  }

  onProgress?.(`Created ${stages.length} themed stages for your journey`);

  // Map raw responses to Stage objects with sequential order numbers
  return stages.map((raw, index): Stage => ({
    id: randomUUID(),
    journeyId,
    title: raw.title,
    summary: raw.summary,
    theme: raw.theme,
    order: index + 1,
    topicsCovered: raw.topicsCovered,
  }));
}

// ─── Prompt Builders ────────────────────────────────────────────────────────

/**
 * Builds a prompt using only section titles.
 * This is the primary strategy — fast, lightweight, works with any model.
 * Full content is preserved in chunks and used during teaching sessions.
 */
function buildTitlesPrompt(
  contentPool: (PooledContentSection | ContentSection)[],
  topic: string
): string {
  // Group sections by source document for better context
  const byDocument = new Map<string, string[]>();

  for (const section of contentPool) {
    const docName = 'sourceDocument' in section
      ? (section as PooledContentSection).sourceDocument
      : 'Document';

    if (!byDocument.has(docName)) {
      byDocument.set(docName, []);
    }
    byDocument.get(docName)!.push(section.title);
  }

  const documentSections: string[] = [];
  for (const [docName, titles] of byDocument) {
    documentSections.push(`From "${docName}":\n${titles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`);
  }

  return `**Learning Topic:** ${topic}

**Document structure (${contentPool.length} sections across ${byDocument.size} document(s)):**

${documentSections.join('\n\n')}

Using ALL the section titles above as your source material, create a creative learning journey of 10-15 themed stages. Every section topic must be covered by at least one stage. Reorganize them into an engaging narrative or progressive learning arc — do NOT follow the document's original order.`;
}

/**
 * Builds a retry prompt when the first attempt produced wrong stage count.
 */
function buildRetryPrompt(
  contentPool: (PooledContentSection | ContentSection)[],
  topic: string,
  previousCount: number
): string {
  const titles = contentPool.map((s) => s.title);
  // Deduplicate
  const uniqueTitles = [...new Set(titles)];

  return `**Learning Topic:** ${topic}

**Topics to cover (${uniqueTitles.length} total):**
${uniqueTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

IMPORTANT: You MUST generate between 10 and 15 stages (inclusive). Your previous attempt generated ${previousCount} stages. Please create exactly 10-15 creative themed stages covering all topics above.`;
}

// ─── LLM Call ───────────────────────────────────────────────────────────────

/**
 * Attempts a single LLM generation call and parses the response into stages.
 */
async function attemptStageGeneration(
  model: Parameters<typeof generateText>[0]['model'],
  userPrompt: string,
  timeout: number
): Promise<LLMStageResponse[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await generateText({
      model,
      system: STAGE_GENERATION_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxRetries: 1,
      abortSignal: controller.signal,
    });

    return parseStagesResponse(result.text);
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
      throw new PlatformError(
        'LLM request timed out during stage generation',
        'LLM_TIMEOUT',
        'The AI provider took too long to respond. Please try again or switch to a different provider.',
        true
      );
    }
    console.error('[stage-generator] LLM call failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Response Parsing ───────────────────────────────────────────────────────

/**
 * Parses the LLM text response into structured stage objects.
 */
function parseStagesResponse(text: string): LLMStageResponse[] {
  let jsonStr = text.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const stages: unknown[] = parsed.stages || parsed;

    if (!Array.isArray(stages)) {
      return [];
    }

    return stages.filter(isValidStage).map(normalizeStage);
  } catch {
    return [];
  }
}

/**
 * Type guard to validate individual stage structure from LLM response.
 */
function isValidStage(stage: unknown): stage is LLMStageResponse {
  if (typeof stage !== 'object' || stage === null) return false;
  const obj = stage as Record<string, unknown>;

  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) return false;
  if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) return false;
  if (typeof obj.theme !== 'string' || obj.theme.trim().length === 0) return false;

  if (!Array.isArray(obj.topicsCovered) || obj.topicsCovered.length === 0) return false;
  if (!obj.topicsCovered.every((t: unknown) => typeof t === 'string' && (t as string).trim().length > 0)) return false;

  const wordCount = countWords(obj.summary);
  if (wordCount < 20 || wordCount > 80) return false;

  return true;
}

/**
 * Normalizes a valid stage response by trimming whitespace.
 */
function normalizeStage(stage: LLMStageResponse): LLMStageResponse {
  return {
    title: stage.title.trim(),
    summary: stage.summary.trim(),
    theme: stage.theme.trim(),
    topicsCovered: stage.topicsCovered.map((t) => t.trim()),
  };
}

/**
 * Counts the number of words in a string.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}
