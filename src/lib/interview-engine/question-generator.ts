// src/lib/interview-engine/question-generator.ts

import { generateText } from 'ai';
import { createProvider, type LLMProviderConfig } from '@/lib/llm/provider';
import { INTERVIEW_QUESTIONS_PROMPT } from '@/lib/llm/prompts';
import { PlatformError } from '@/lib/errors';
import type { MockQuestion } from './index';

/**
 * Represents the raw question structure returned by the LLM
 * before we add generated metadata (id, role, createdAt).
 */
interface LLMQuestionResponse {
  question: string;
  difficulty: 'medium' | 'hard';
  topicArea: string;
}

/**
 * Generates mock interview questions for a given role using the LLM.
 * Excludes previously archived question IDs from generation.
 * Returns 5-10 questions targeting high failure rate topics.
 *
 * @throws PlatformError with code 'NO_QUESTIONS_AVAILABLE' if all questions are archived.
 */
export async function generateMockQuestions(
  role: string,
  archivedIds: string[],
  llmProvider: LLMProviderConfig
): Promise<MockQuestion[]> {
  // If we have an unusually large number of archived IDs, this signals
  // the user has exhausted available questions. We still attempt generation,
  // but handle the case where the LLM can't produce new ones.
  const provider = createProvider(llmProvider);
  const model =
    llmProvider.type === 'anthropic'
      ? provider.languageModel(llmProvider.model)
      : (provider as ReturnType<typeof import('@ai-sdk/openai').createOpenAI>).chat(llmProvider.model);

  const excludedContext =
    archivedIds.length > 0
      ? `\n\n**Excluded Question IDs (do not regenerate questions similar to these):**\n${archivedIds.join(', ')}`
      : '';

  const userPrompt = `Generate challenging mock interview questions for the role: "${role}".${excludedContext}\n\nGenerate between 5 and 10 questions. Focus on topics where candidates most commonly fail.`;

  // Attempt generation with one retry if count is insufficient
  let questions = await attemptGeneration(model, userPrompt, Math.max(llmProvider.timeout, 120000));

  // If fewer than 5 questions, try one more time with explicit instruction
  if (questions.length < 5) {
    const retryPrompt = `${userPrompt}\n\nIMPORTANT: You MUST generate at least 5 questions. The previous attempt only generated ${questions.length}. Please ensure you return between 5 and 10 questions.`;
    const retryQuestions = await attemptGeneration(model, retryPrompt, Math.max(llmProvider.timeout, 120000));

    if (retryQuestions.length > questions.length) {
      questions = retryQuestions;
    }
  }

  // If still no questions available after retries, it means all questions are exhausted
  if (questions.length === 0) {
    throw new PlatformError(
      `No new questions available for role: ${role}`,
      'NO_QUESTIONS_AVAILABLE',
      `All available mock questions for the "${role}" role have been archived. Consider resetting your archive to get fresh questions.`,
      false
    );
  }

  // Map raw LLM responses to MockQuestion objects with metadata
  const now = new Date();
  return questions.map((q, index): MockQuestion => ({
    id: generateQuestionId(role, index, now),
    role,
    question: q.question,
    difficulty: q.difficulty,
    topicArea: q.topicArea,
    createdAt: now,
  }));
}

/**
 * Attempts a single generation call to the LLM and parses the response.
 */
async function attemptGeneration(
  model: Parameters<typeof generateText>[0]['model'],
  userPrompt: string,
  timeout: number
): Promise<LLMQuestionResponse[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await generateText({
      model,
      system: INTERVIEW_QUESTIONS_PROMPT,
      prompt: userPrompt,
      maxRetries: 1,
      abortSignal: controller.signal,
    });

    return parseQuestionsResponse(result.text);
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
      throw new PlatformError(
        'LLM request timed out during question generation',
        'LLM_TIMEOUT',
        'The AI provider took too long to respond. Please try again or switch to a different provider.',
        true
      );
    }
    throw new PlatformError(
      `LLM generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'LLM_UNAVAILABLE',
      'The AI provider is currently unavailable. Please try again or select an alternative provider.',
      true
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parses the LLM text response into structured question objects.
 * Handles both clean JSON and JSON embedded in markdown code blocks.
 */
function parseQuestionsResponse(text: string): LLMQuestionResponse[] {
  // Try to extract JSON from the response (may be wrapped in markdown code block)
  let jsonStr = text.trim();

  // Strip markdown code block if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const questions: unknown[] = parsed.questions || parsed;

    if (!Array.isArray(questions)) {
      return [];
    }

    // Validate and filter each question
    return questions
      .filter(isValidQuestion)
      .slice(0, 10); // Cap at 10 questions max
  } catch {
    // If JSON parsing fails, return empty - caller will handle retry
    return [];
  }
}

/**
 * Type guard to validate individual question structure from LLM response.
 */
function isValidQuestion(q: unknown): q is LLMQuestionResponse {
  if (typeof q !== 'object' || q === null) return false;
  const obj = q as Record<string, unknown>;

  return (
    typeof obj.question === 'string' &&
    obj.question.trim().length > 0 &&
    (obj.difficulty === 'medium' || obj.difficulty === 'hard') &&
    typeof obj.topicArea === 'string' &&
    obj.topicArea.trim().length > 0
  );
}

/**
 * Generates a unique ID for a mock question based on role, index, and timestamp.
 */
function generateQuestionId(role: string, index: number, timestamp: Date): string {
  const roleSlug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
  const timeStr = timestamp.getTime().toString(36);
  return `mq-${roleSlug}-${timeStr}-${index}`;
}
