// src/lib/progress-tracker/index.ts

import type { Stage } from '@/lib/journey-map-generator';
import { prisma } from '@/lib/db/client';

export interface StageProgress {
  stageId: string;
  journeyId: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  completedAt?: Date;
}

export interface JourneyProgress {
  journeyId: string;
  stages: StageProgress[];
  completedCount: number;
  totalStages: number;
  percentComplete: number;
}

/**
 * Computes the progress percentage for a journey.
 * Guards against division by zero and clamps the result to [0, 100].
 */
export function computeProgressPercentage(
  completedCount: number,
  totalStages: number
): number {
  if (totalStages <= 0) {
    return 0;
  }
  if (completedCount < 0) {
    return 0;
  }
  const percentage = Math.round((completedCount / totalStages) * 100);
  return Math.min(100, Math.max(0, percentage));
}

/**
 * Computes the unlock status for all stages given completion data.
 * Pure function suitable for property-based testing.
 *
 * Invariants:
 * - Stage with order=1 is always 'unlocked' or 'completed'
 * - A stage is 'completed' if it appears in the completions array
 * - A stage is 'unlocked' only if the previous stage (by order) is 'completed'
 * - All other stages are 'locked'
 */
export function computeStageStatuses(
  stages: Stage[],
  completions: { stageId: string; completedAt: Date }[]
): StageProgress[] {
  if (stages.length === 0) {
    return [];
  }

  // Build a lookup set for completed stage IDs and their completion dates
  const completionMap = new Map<string, Date>();
  for (const completion of completions) {
    completionMap.set(completion.stageId, completion.completedAt);
  }

  // Sort stages by order to ensure sequential processing
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const result: StageProgress[] = [];

  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    const isCompleted = completionMap.has(stage.id);

    let status: StageProgress['status'];

    if (isCompleted) {
      status = 'completed';
    } else if (i === 0) {
      // First stage (lowest order) is always unlocked if not completed
      status = 'unlocked';
    } else {
      // A stage is unlocked only if the previous stage is completed
      const previousStage = sortedStages[i - 1];
      const previousCompleted = completionMap.has(previousStage.id);
      status = previousCompleted ? 'unlocked' : 'locked';
    }

    const stageProgress: StageProgress = {
      stageId: stage.id,
      journeyId: stage.journeyId,
      status,
    };

    if (isCompleted) {
      stageProgress.completedAt = completionMap.get(stage.id);
    }

    result.push(stageProgress);
  }

  return result;
}

/**
 * Gets the full progress state for a journey.
 * Queries all stages and progress records from the database,
 * computes statuses using computeStageStatuses, and returns
 * the complete JourneyProgress object.
 */
export async function getJourneyProgress(
  journeyId: string
): Promise<JourneyProgress> {
  // Query all stages for this journey ordered by `order`
  const stages = await prisma.stage.findMany({
    where: { journeyId },
    orderBy: { order: 'asc' },
  });

  // Query all StageProgress records that are completed for this journey
  const progressRecords = await prisma.stageProgress.findMany({
    where: { journeyId, status: 'completed' },
  });

  // Map DB stages to the Stage interface expected by computeStageStatuses
  const stageInputs: Stage[] = stages.map((s) => ({
    id: s.id,
    journeyId: s.journeyId,
    title: s.title,
    summary: s.summary,
    theme: s.theme,
    order: s.order,
    topicsCovered: JSON.parse(s.topicsCovered) as string[],
  }));

  // Build completions from progress records
  const completions = progressRecords
    .filter((p) => p.completedAt !== null)
    .map((p) => ({
      stageId: p.stageId,
      completedAt: p.completedAt as Date,
    }));

  // Compute statuses using the pure function
  const stageStatuses = computeStageStatuses(stageInputs, completions);

  const totalStages = stages.length;
  const completedCount = completions.length;
  const percentComplete = computeProgressPercentage(completedCount, totalStages);

  return {
    journeyId,
    stages: stageStatuses,
    completedCount,
    totalStages,
    percentComplete,
  };
}

/**
 * Marks a stage as completed and persists the completion to the database.
 * Uses upsert to handle both creating new progress records and updating existing ones.
 * Returns the updated StageProgress.
 */
export async function completeStage(
  journeyId: string,
  stageId: string
): Promise<StageProgress> {
  const now = new Date();

  // Upsert the StageProgress record: set status to 'completed' and completedAt
  await prisma.stageProgress.upsert({
    where: {
      journeyId_stageId: {
        journeyId,
        stageId,
      },
    },
    update: {
      status: 'completed',
      completedAt: now,
    },
    create: {
      stageId,
      journeyId,
      status: 'completed',
      completedAt: now,
    },
  });

  return {
    stageId,
    journeyId,
    status: 'completed',
    completedAt: now,
  };
}

