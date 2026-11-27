// src/lib/journey-map-generator/index.ts

import type { ParsedDocument, ContentSection } from '@/lib/document-processor';
import type { LLMProviderConfig } from '@/lib/llm/provider';
import { prisma } from '@/lib/db/client';
import { searchWebForEnrichment } from '@/lib/information-validator/web-search';
import { buildUnifiedContentPool } from './content-pool';
import { chunkDocumentContent, type ChunkableSection } from './content-chunker';
import { generateStages } from './stage-generator';
import { assignChunksToStages } from './stage-assignment';
import { PlatformError } from '@/lib/errors';

export interface Stage {
  id: string;
  journeyId: string;
  title: string;
  summary: string; // 20-80 words
  theme: string; // creative theme label
  order: number; // sequential position
  topicsCovered: string[]; // list of topics/concepts in this stage
}

export interface ContentChunk {
  id: string;
  stageId: string;
  journeyId: string;
  content: string; // 200-1000 words
  sourceDocument: string; // filename of origin document
  sourceSection: string; // original section title
  order: number; // ordering within stage
  wordCount: number;
}

export interface JourneyMap {
  id: string;
  topic: string;
  stages: Stage[];
  totalStages: number;
  createdAt: Date;
}

export interface JourneyProgressEvent {
  stage:
    | 'extracting'
    | 'chunking'
    | 'generating-stages'
    | 'assigning-chunks'
    | 'persisting'
    | 'complete';
  message: string;
  progress: number; // 0-100
}

export interface GenerateJourneyMapParams {
  topic: string;
  documents?: ParsedDocument[];
  llmProvider: LLMProviderConfig;
  onProgress?: (event: JourneyProgressEvent) => void;
}

/**
 * Converts Tavily web search results into ContentSection format
 * for use in the journey generation pipeline when no documents are provided.
 */
async function fetchTopicContent(topic: string): Promise<ContentSection[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const results = await searchWebForEnrichment(topic, {
      maxResults: 10,
      signal: controller.signal,
    });

    if (results.length === 0) {
      throw new PlatformError(
        'No web content found for the given topic',
        'INTERNET_SOURCE_UNAVAILABLE',
        'Could not find web sources for this topic. Please try a different topic or upload documents.',
        true
      );
    }

    return results.map((result, index): ContentSection => ({
      title: result.title || `Web Source ${index + 1}`,
      body: result.snippet || '',
      order: index + 1,
      level: 1,
    }));
  } catch (error) {
    if (error instanceof PlatformError) throw error;
    throw new PlatformError(
      `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'INTERNET_SOURCE_UNAVAILABLE',
      'Web search is currently unavailable. Please try again or upload documents instead.',
      true
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main orchestrator function for generating a complete journey map.
 *
 * Flow:
 * 1. Extract content (from documents or web via Tavily for topic-only mode)
 * 2. Chunk the content into manageable pieces
 * 3. Generate themed stages using LLM
 * 4. Assign chunks to stages using LLM semantic matching
 * 5. Persist everything to the database
 * 6. Return the complete JourneyMap
 */
export async function generateJourneyMap(
  params: GenerateJourneyMapParams
): Promise<JourneyMap> {
  const { topic, documents, llmProvider, onProgress } = params;

  // Step 1: Report progress - extracting
  onProgress?.({
    stage: 'extracting',
    message: 'Extracting content from sources...',
    progress: 0,
  });

  // Build unified content pool from documents or fetch from web
  let contentSections: ChunkableSection[];

  if (documents && documents.length > 0) {
    // Document mode: combine all document sections (preserving sourceDocument metadata)
    contentSections = buildUnifiedContentPool(documents);
  } else {
    // Topic-only mode: query Tavily for web content
    contentSections = await fetchTopicContent(topic);
  }

  // Step 2: Report progress - chunking
  onProgress?.({
    stage: 'chunking',
    message: 'Chunking content into learning segments...',
    progress: 20,
  });

  const rawChunks = chunkDocumentContent(contentSections);

  // Step 3: Report progress - generating stages
  onProgress?.({
    stage: 'generating-stages',
    message: 'Generating themed learning stages...',
    progress: 40,
  });

  // Generate stages (journeyId will be updated after we create the journey in DB)
  const stages = await generateStages(contentSections, topic, llmProvider, '', (message) => {
    onProgress?.({
      stage: 'generating-stages',
      message,
      progress: 45,
    });
  });

  // Step 4: Report progress - assigning chunks
  onProgress?.({
    stage: 'assigning-chunks',
    message: 'Mapping content to stages...',
    progress: 60,
  });

  // Assign chunks to stages (journeyId will be set during persistence)
  const contentChunks = await assignChunksToStages(rawChunks, stages);

  // Step 5: Report progress - persisting
  onProgress?.({
    stage: 'persisting',
    message: 'Saving journey to database...',
    progress: 80,
  });

  // Persist everything to the database in a transaction
  const journey = await prisma.$transaction(async (tx) => {
    // Create the Journey record
    const journeyRecord = await tx.journey.create({
      data: {
        topic,
        isInteractive: true,
      },
    });

    const journeyId = journeyRecord.id;

    // Create Stage records
    for (const stage of stages) {
      await tx.stage.create({
        data: {
          id: stage.id,
          journeyId,
          title: stage.title,
          summary: stage.summary,
          theme: stage.theme,
          order: stage.order,
          topicsCovered: JSON.stringify(stage.topicsCovered),
        },
      });
    }

    // Create ContentChunk records
    for (const chunk of contentChunks) {
      await tx.contentChunk.create({
        data: {
          id: chunk.id,
          stageId: chunk.stageId,
          journeyId,
          content: chunk.content,
          sourceDocument: chunk.sourceDocument,
          sourceSection: chunk.sourceSection,
          order: chunk.order,
          wordCount: chunk.wordCount,
        },
      });
    }

    // Create initial StageProgress records (first stage unlocked, rest locked)
    for (let i = 0; i < stages.length; i++) {
      await tx.stageProgress.create({
        data: {
          stageId: stages[i].id,
          journeyId,
          status: i === 0 ? 'unlocked' : 'locked',
        },
      });
    }

    return journeyRecord;
  });

  // Update stage references with the persisted journeyId
  const finalStages: Stage[] = stages.map((s) => ({
    ...s,
    journeyId: journey.id,
  }));

  // Step 6: Report progress - complete
  onProgress?.({
    stage: 'complete',
    message: 'Journey map generated successfully!',
    progress: 100,
  });

  return {
    id: journey.id,
    topic,
    stages: finalStages,
    totalStages: finalStages.length,
    createdAt: journey.createdAt,
  };
}
