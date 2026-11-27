// src/app/api/teach-me/review/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import { stageActivity } from '@/lib/progress-tracker/activity';
import { readActivityRows } from '@/lib/progress-tracker/activity-rows';
import { MAX_REMINDERS, reviewItems, type ReviewJourneyInput } from '@/lib/progress-tracker/review-reminders';

const STATUSES = new Set(['locked', 'unlocked', 'in_progress', 'completed']);

/**
 * GET /api/teach-me/review
 * Read-only: stages due for review across all interactive journeys, most urgent first.
 * Response: { items: ReviewItem[] (at most MAX_REMINDERS), total: number }
 */
export async function GET() {
  try {
    const journeys = await prisma.journey.findMany({
      where: { isInteractive: true },
      select: {
        id: true,
        topic: true,
        stages: { select: { id: true, order: true, title: true }, orderBy: { order: 'asc' } },
        progress: { select: { stageId: true, status: true, completedAt: true } },
      },
    });
    if (!journeys.length) return NextResponse.json({ items: [], total: 0 });

    const now = new Date();
    const rows = await readActivityRows({ journeyId: { in: journeys.map((j) => j.id) } }, now);
    const activity = new Map(
      stageActivity(
        journeys.flatMap((j) => j.stages.map((s) => s.id)),
        rows.latest,
        rows.study,
        rows.checks,
        rows.due
      ).map((a) => [a.stageId, a])
    );

    const input: ReviewJourneyInput[] = journeys.map((journey) => {
      const progress = new Map(journey.progress.map((p) => [p.stageId, p]));
      return {
        id: journey.id,
        topic: journey.topic,
        stages: journey.stages.map((stage) => {
          const p = progress.get(stage.id);
          const a = activity.get(stage.id);
          // A stage without a progress row is treated as locked, so it is never suggested.
          const status = p && STATUSES.has(p.status) ? (p.status as ReviewJourneyInput['stages'][number]['status']) : 'locked';
          return {
            id: stage.id,
            order: stage.order,
            title: stage.title,
            status,
            completedAt: p?.completedAt ? p.completedAt.toISOString() : null,
            lastStudiedAt: a?.lastStudiedAt ?? null,
            lastCheck: a?.lastCheck ?? null,
            dueCards: a?.dueCards ?? 0,
          };
        }),
      };
    });

    const items = reviewItems(input, now);
    return NextResponse.json({ items: items.slice(0, MAX_REMINDERS), total: items.length });
  } catch (error) {
    return handleApiError(error);
  }
}
