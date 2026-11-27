// src/lib/interview-engine/index.ts

import type { LLMProviderConfig } from '@/lib/llm/provider';
import { generateMockQuestions as generateMockQuestionsImpl } from './question-generator';
import { prisma } from '@/lib/db/client';

export interface MockQuestion {
  id: string;
  role: string;
  question: string;
  difficulty: 'medium' | 'hard';
  topicArea: string; // area with high failure rate
  createdAt: Date;
}

export interface ArchivedQuestion {
  id: string;
  role: string;
  question: string;
  userAnswer: string;
  score: number;
  archivedAt: Date;
}

/** Converts a Prisma ArchivedQuestion record to the domain interface. */
function toArchivedQuestion(record: {
  id: string;
  role: string;
  question: string;
  userAnswer: string;
  score: number;
  archivedAt: Date;
}): ArchivedQuestion {
  return {
    id: record.id,
    role: record.role,
    question: record.question,
    userAnswer: record.userAnswer,
    score: record.score,
    archivedAt: record.archivedAt,
  };
}

/**
 * Generates mock interview questions for a role,
 * excluding previously archived questions.
 */
export async function generateMockQuestions(
  role: string,
  archivedIds: string[],
  llmProvider: LLMProviderConfig
): Promise<MockQuestion[]> {
  return generateMockQuestionsImpl(role, archivedIds, llmProvider);
}

/**
 * Archives a scored question with user's answer.
 * Creates an ArchivedQuestion record in the database.
 *
 * @param questionId - The unique ID of the question being archived
 * @param role - The role this question belongs to
 * @param questionText - The full question text to archive
 * @param userAnswer - The user's submitted answer
 * @param score - The score received (1-10)
 */
export async function archiveQuestion(
  questionId: string,
  role: string,
  questionText: string,
  userAnswer: string,
  score: number
): Promise<ArchivedQuestion> {
  const archived = await prisma.archivedQuestion.create({
    data: {
      id: questionId,
      role,
      question: questionText,
      userAnswer,
      score,
    },
  });

  return toArchivedQuestion(archived);
}

/**
 * Retrieves all archived questions for a role, ordered by most recent first.
 */
export async function getArchive(
  role: string
): Promise<ArchivedQuestion[]> {
  const records = await prisma.archivedQuestion.findMany({
    where: { role },
    orderBy: { archivedAt: 'desc' },
  });

  return records.map(toArchivedQuestion);
}

/**
 * Removes a question from the archive, making it eligible for future sessions.
 */
export async function unarchiveQuestion(
  questionId: string
): Promise<void> {
  await prisma.archivedQuestion.delete({
    where: { id: questionId },
  });
}

/**
 * Retrieves all archived questions grouped by role.
 * Returns a record where each key is a role and the value is the array of archived questions for that role.
 */
export async function getAllArchivesGroupedByRole(): Promise<Record<string, ArchivedQuestion[]>> {
  const records = await prisma.archivedQuestion.findMany({
    orderBy: { archivedAt: 'desc' },
  });

  const grouped: Record<string, ArchivedQuestion[]> = {};

  for (const record of records) {
    const item = toArchivedQuestion(record);

    if (!grouped[item.role]) {
      grouped[item.role] = [];
    }
    grouped[item.role].push(item);
  }

  return grouped;
}

/**
 * Returns the IDs of all archived questions for a given role.
 * Useful for excluding archived questions from new question generation.
 */
export async function getArchivedQuestionIds(
  role: string
): Promise<string[]> {
  const records = await prisma.archivedQuestion.findMany({
    where: { role },
    select: { id: true },
  });

  return records.map((record: { id: string }) => record.id);
}
