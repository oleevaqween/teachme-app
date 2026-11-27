// src/app/api/journey/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { handleApiError } from '@/lib/errors';
import type { Journey, JourneySection, Quiz, SourceAttribution } from '@/lib/curriculum-engine';

/**
 * GET /api/journey/[id]
 * Fetches a saved journey by ID from the database.
 * For interactive journeys, includes stages with parsed topicsCovered.
 * For legacy journeys, includes sections as before.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const journeyRecord = await prisma.journey.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { order: 'asc' },
        },
        stages: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!journeyRecord) {
      return NextResponse.json(
        { error: 'Journey not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // If this is an interactive journey, return stages-based response
    if (journeyRecord.isInteractive) {
      const stages = journeyRecord.stages.map((stage) => {
        let topicsCovered: string[] = [];
        try {
          topicsCovered = JSON.parse(stage.topicsCovered);
        } catch {
          // Default to empty array if JSON parsing fails
        }

        return {
          id: stage.id,
          title: stage.title,
          summary: stage.summary,
          theme: stage.theme,
          order: stage.order,
          topicsCovered,
        };
      });

      return NextResponse.json({
        id: journeyRecord.id,
        topic: journeyRecord.topic,
        isInteractive: true,
        stages,
        totalStages: stages.length,
        createdAt: journeyRecord.createdAt,
      });
    }

    // Legacy journey: return sections-based response
    const sections: JourneySection[] = journeyRecord.sections.map((s) => {
      let quiz: Quiz | undefined;
      if (s.quizData) {
        try {
          quiz = JSON.parse(s.quizData);
        } catch {
          // Skip malformed quiz data
        }
      }

      const attribution: SourceAttribution | undefined =
        s.attributionName
          ? {
              name: s.attributionName,
              url: s.attributionUrl ?? undefined,
              type: 'community' as const,
            }
          : undefined;

      return {
        id: s.id,
        title: s.title,
        content: s.content,
        order: s.order,
        sourceTag: s.sourceTag as 'Document-sourced' | 'Internet-sourced',
        confidenceLevel: s.confidenceLevel as 'High' | 'Medium' | 'Low' | undefined,
        quiz,
        relatedSections: [],
        attribution,
      };
    });

    // Collect unique attributions for sources array
    const sourcesMap = new Map<string, SourceAttribution>();
    for (const section of sections) {
      if (section.attribution) {
        const key = `${section.attribution.name}:${section.attribution.url ?? ''}`;
        if (!sourcesMap.has(key)) {
          sourcesMap.set(key, section.attribution);
        }
      }
    }

    const journey: Journey & { isInteractive: boolean } = {
      id: journeyRecord.id,
      topic: journeyRecord.topic,
      isInteractive: false,
      sections,
      totalSections: sections.length,
      createdAt: journeyRecord.createdAt,
      sources: Array.from(sourcesMap.values()),
    };

    return NextResponse.json(journey);
  } catch (error) {
    return handleApiError(error);
  }
}


/**
 * DELETE /api/journey/[id]
 * Deletes a journey and all related data from the database.
 * Prisma cascade (onDelete: Cascade) handles stages, chunks, messages, and progress.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify journey exists before deletion
    const journey = await prisma.journey.findUnique({
      where: { id },
    });

    if (!journey) {
      return NextResponse.json(
        { error: 'Journey not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Delete the journey — cascade handles sections, stages, chunks, messages, progress
    await prisma.journey.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
