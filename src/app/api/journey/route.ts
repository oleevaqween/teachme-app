// src/app/api/journey/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/journey
 * Lists all saved journeys (summary only — no full section content).
 * Includes isInteractive flag and stage count for interactive journeys.
 */
export async function GET() {
  try {
    const journeys = await prisma.journey.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        sections: {
          select: { id: true },
        },
        stages: {
          select: { id: true },
        },
      },
    });

    const summaries = journeys.map((j) => ({
      id: j.id,
      topic: j.topic,
      createdAt: j.createdAt,
      isInteractive: j.isInteractive,
      sectionCount: j.sections.length,
      stageCount: j.stages.length,
    }));

    return NextResponse.json({ journeys: summaries });
  } catch (error) {
    return handleApiError(error);
  }
}
