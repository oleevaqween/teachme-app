// src/lib/curriculum-engine/quiz-generator.ts

import { generateText } from 'ai';
import { createProvider } from '@/lib/llm/provider';
import { QUIZ_GENERATION_PROMPT } from '@/lib/llm/prompts';
import type { LLMProviderConfig } from '@/lib/llm/provider';
import type { JourneySection, Quiz, QuizQuestion, QuizInsertionPlan } from './index';

/**
 * Determines quiz insertion points for a journey.
 * This is a PURE function — no side effects or external calls.
 *
 * Frequency constraint: for N sections, the number of quizzes Q must satisfy:
 *   ceil(N/5) <= Q <= floor(N/3)
 *
 * Quizzes are evenly distributed throughout the journey to avoid clustering.
 */
export function planQuizInsertion(sections: JourneySection[]): QuizInsertionPlan {
  const N = sections.length;

  // For fewer than 3 sections, no quizzes can satisfy the constraint meaningfully
  if (N < 3) {
    return { insertionPoints: [], totalQuizzes: 0 };
  }

  const minQuizzes = Math.ceil(N / 5);
  const maxQuizzes = Math.floor(N / 3);

  // If the constraint range is invalid (min > max), use the minimum
  // This shouldn't happen for N >= 3, but guard against edge cases
  if (minQuizzes > maxQuizzes) {
    return { insertionPoints: [], totalQuizzes: 0 };
  }

  // Choose a quiz count that's in the middle of the valid range for balanced distribution
  const totalQuizzes = Math.min(maxQuizzes, Math.max(minQuizzes, Math.round((minQuizzes + maxQuizzes) / 2)));

  // Distribute quizzes evenly throughout the journey
  const insertionPoints = distributeEvenly(N, totalQuizzes);

  return { insertionPoints, totalQuizzes };
}

/**
 * Distributes quiz insertion points evenly across N sections.
 * Returns section indices (0-based) where quizzes should be placed.
 *
 * The algorithm spaces quizzes at regular intervals, placing them
 * after every `step` sections to avoid clustering at the start or end.
 */
function distributeEvenly(sectionCount: number, quizCount: number): number[] {
  if (quizCount === 0) return [];
  if (quizCount >= sectionCount) {
    // Shouldn't happen given the constraint, but handle gracefully
    return Array.from({ length: sectionCount }, (_, i) => i);
  }

  const points: number[] = [];

  // Calculate the step size between quizzes
  // We want quizzes distributed across the full range of sections
  const step = sectionCount / (quizCount + 1);

  for (let i = 1; i <= quizCount; i++) {
    // Place quiz at evenly spaced intervals, rounding to nearest index
    const index = Math.round(step * i) - 1;
    // Ensure index is within bounds
    const clampedIndex = Math.max(0, Math.min(sectionCount - 1, index));
    points.push(clampedIndex);
  }

  // Remove any duplicates that might arise from rounding and sort
  const uniquePoints = [...new Set(points)].sort((a, b) => a - b);

  // If we lost points due to deduplication, fill in gaps
  if (uniquePoints.length < quizCount) {
    const missing = quizCount - uniquePoints.length;
    const usedSet = new Set(uniquePoints);

    for (let i = 0; i < sectionCount && uniquePoints.length < quizCount; i++) {
      if (!usedSet.has(i)) {
        uniquePoints.push(i);
        usedSet.add(i);
      }
    }
    uniquePoints.sort((a, b) => a - b);
  }

  return uniquePoints.slice(0, quizCount);
}

/**
 * Generates a quiz for a given section using the LLM.
 * Returns a Quiz object with 2-4 multiple-choice questions.
 *
 * Each question has:
 * - 4 options
 * - 1 correct answer (index)
 * - An explanation of why the answer is correct
 */
export async function generateQuizForSection(
  section: JourneySection,
  llmProvider: LLMProviderConfig
): Promise<Quiz> {
  const provider = createProvider(llmProvider);

  const model = llmProvider.type === 'anthropic'
    ? provider.languageModel(llmProvider.model)
    : (provider as ReturnType<typeof import('@ai-sdk/openai').createOpenAI>).chat(llmProvider.model);

  const userPrompt = `Generate quiz questions for the following learning section:

Title: ${section.title}

Content:
${section.content}

Create 2-4 multiple-choice questions that test understanding of the key concepts in this section.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), llmProvider.timeout || 60000);

  try {
    const result = await generateText({
      model,
      system: QUIZ_GENERATION_PROMPT,
      prompt: userPrompt,
      maxRetries: 1,
      abortSignal: controller.signal,
    });

    const parsed = parseQuizResponse(result.text, section.id);
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parses the LLM response text into a Quiz object.
 * Handles JSON extraction from potentially wrapped responses.
 */
function parseQuizResponse(responseText: string, sectionId: string): Quiz {
  // Try to extract JSON from the response
  let jsonStr = responseText.trim();

  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object in the response
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  let parsed: { questions?: Array<{
    question?: string;
    options?: string[];
    correctAnswer?: number;
    explanation?: string;
  }> };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // If parsing fails, return a fallback quiz with a single question
    return createFallbackQuiz(sectionId);
  }

  if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return createFallbackQuiz(sectionId);
  }

  // Validate and normalize questions (ensure 2-4 questions)
  const validQuestions = parsed.questions
    .filter((q) =>
      q.question &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correctAnswer === 'number' &&
      q.correctAnswer >= 0 &&
      q.correctAnswer <= 3 &&
      q.explanation
    )
    .slice(0, 4); // Max 4 questions

  if (validQuestions.length < 2) {
    return createFallbackQuiz(sectionId);
  }

  const questions: QuizQuestion[] = validQuestions.map((q, index) => ({
    id: `quiz-${sectionId}-q${index}`,
    question: q.question!,
    options: q.options!,
    correctAnswer: q.correctAnswer!,
    explanation: q.explanation!,
  }));

  return {
    id: `quiz-${sectionId}`,
    questions,
    sectionId,
  };
}

/**
 * Creates a fallback quiz when LLM response parsing fails.
 */
function createFallbackQuiz(sectionId: string): Quiz {
  return {
    id: `quiz-${sectionId}`,
    questions: [
      {
        id: `quiz-${sectionId}-q0`,
        question: 'What is the main concept discussed in this section?',
        options: [
          'The primary topic covered',
          'An unrelated subject',
          'A historical overview only',
          'None of the above',
        ],
        correctAnswer: 0,
        explanation: 'This section focuses on the primary topic as its main concept.',
      },
      {
        id: `quiz-${sectionId}-q1`,
        question: 'Which statement best summarizes this section?',
        options: [
          'It provides a comprehensive overview',
          'It only lists definitions',
          'It contains only examples',
          'It is purely theoretical',
        ],
        correctAnswer: 0,
        explanation: 'The section provides a comprehensive overview of the topic.',
      },
    ],
    sectionId,
  };
}
