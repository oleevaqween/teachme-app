// src/lib/curriculum-engine/index.ts

import { randomUUID } from 'crypto';
import type { ParsedDocument, ContentSection } from '@/lib/document-processor';
import type { LLMProviderConfig } from '@/lib/llm/provider';
import { searchInternetSources } from '@/lib/web-sourcer';
import type { CommunitySource } from '@/lib/web-sourcer';
import { verifyBatch } from '@/lib/information-validator';
import { prisma } from '@/lib/db/client';
import { mapToVerifiedSources, integrateSources, collectAttributions } from './source-integrator';
import { buildJourneyStructure } from './journey-builder';
import { planQuizInsertion, generateQuizForSection } from './quiz-generator';

export interface Journey {
  id: string;
  topic: string;
  sections: JourneySection[];
  totalSections: number;
  createdAt: Date;
  sources: SourceAttribution[];
}

export interface JourneySection {
  id: string;
  title: string;
  content: string;
  order: number;
  sourceTag: 'Document-sourced' | 'Internet-sourced';
  confidenceLevel?: 'High' | 'Medium' | 'Low';
  quiz?: Quiz;
  relatedSections: string[]; // IDs of connected sections (branching)
  attribution?: SourceAttribution;
}

export interface Quiz {
  id: string;
  questions: QuizQuestion[];
  sectionId: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface SourceAttribution {
  name: string;
  url?: string;
  type: 'document' | 'community' | 'forum' | 'article';
}

export interface JourneyGenerationParams {
  topic: string;
  documents?: ParsedDocument[];
  llmProvider: LLMProviderConfig;
}

/** Verified source from the web sourcer after information validation */
export interface VerifiedSource {
  url: string;
  title: string;
  content: string;
  communityName: string;
  confidenceLevel: 'High' | 'Medium' | 'Low';
}

/** Plan for quiz insertion points within a journey */
export interface QuizInsertionPlan {
  insertionPoints: number[]; // section indices where quizzes should be placed
  totalQuizzes: number;
}

/** Progress callback for streaming journey generation */
export type JourneyProgressCallback = (event: JourneyProgressEvent) => void;

export interface JourneyProgressEvent {
  stage: 'extracting' | 'sourcing' | 'validating' | 'building' | 'quizzing' | 'persisting' | 'complete';
  message: string;
  progress: number; // 0-100
  partialJourney?: Partial<Journey>;
}

/**
 * Generates a complete learning Journey from topic and optional documents.
 * Orchestrates: document extraction → web sourcing → validation →
 * journey structure building → quiz insertion → source integration → persistence.
 *
 * Supports progressive rendering via an optional progress callback.
 */
export async function generateJourney(
  params: JourneyGenerationParams,
  onProgress?: JourneyProgressCallback
): Promise<Journey> {
  const { topic, documents, llmProvider } = params;

  // --- Stage 1: Extract content from documents (if provided) ---
  onProgress?.({
    stage: 'extracting',
    message: 'Extracting content from documents...',
    progress: 10,
  });

  let contentSections: ContentSection[] = [];

  if (documents && documents.length > 0) {
    // Documents are already parsed as ParsedDocument[], extract their sections
    for (const doc of documents) {
      contentSections.push(...doc.content.sections);
    }
  }

  // If no document sections, create a minimal topic-based section
  // so the journey builder has something to work with
  if (contentSections.length === 0) {
    contentSections = [
      {
        title: topic,
        body: `Overview and introduction to ${topic}.`,
        order: 1,
        level: 1,
      },
    ];
  }

  // --- Stage 2 & 3: Run community search AND LLM content generation IN PARALLEL ---
  // These don't depend on each other, so we can save significant time by running both at once.
  onProgress?.({
    stage: 'building',
    message: 'Creating your personalized learning journey...',
    progress: 25,
  });

  // Determine search queries for community content
  let searchQueries: string[];

  if (documents && documents.length > 0 && contentSections.length > 0) {
    const allHeadings = contentSections
      .map((s) => s.title)
      .filter((title) => title.length > 3 && title.length < 100);
    const uniqueHeadings = [...new Set(allHeadings)];
    const genericTerms = new Set(['introduction', 'conclusion', 'summary', 'overview', 'preface', 'index', 'appendix', 'references', 'bibliography']);
    const meaningfulHeadings = uniqueHeadings.filter(
      (h) => !genericTerms.has(h.toLowerCase().trim())
    );
    searchQueries = meaningfulHeadings.slice(0, 3); // Reduced from 5 to 3 for speed
    if (searchQueries.length === 0) searchQueries = [topic];
  } else {
    searchQueries = [topic];
  }

  // Prepare source content for the LLM — FILTER OUT GARBAGE
  // PDF parsing often extracts TOC, page numbers, figure lists, copyright text.
  // We need to keep only actual educational content (paragraphs with real explanations).
  const meaningfulSections = contentSections
    .filter((s) => {
      const body = s.body?.trim() ?? '';
      const title = s.title?.trim() ?? '';

      // Skip empty sections
      if (body.length < 50) return false;

      // Skip table of contents entries (numbered lists of chapters)
      if (/^\d+\.\d+(\.\d+)?\s/.test(body) && body.split('\n').length > 10) return false;

      // Skip page number-only sections
      if (/^\d+$/.test(body.trim())) return false;

      // Skip figure/table list sections
      if (title.toLowerCase().includes('list of') || title.toLowerCase().includes('table of contents')) return false;

      // Skip copyright/legal sections
      if (body.toLowerCase().includes('copyright') && body.toLowerCase().includes('permission')) return false;
      if (body.toLowerCase().includes('library of congress')) return false;

      // Skip sections that are mostly numbered references (e.g., "4.2.1 Inputs... 4.2.2 Tools...")
      const numberedLines = body.split('\n').filter((line) => /^\d+\.\d+/.test(line.trim()));
      if (numberedLines.length > 5 && numberedLines.length > body.split('\n').length * 0.7) return false;

      return true;
    })
    .slice(0, 40)
    .map((s) => `## ${s.title}\n${s.body.slice(0, 1500)}`)
    .join('\n\n');

  // Use the LLM to create engaging journey content
  const { generateText } = await import('ai');
  const { createProvider } = await import('@/lib/llm/provider');
  const { CURRICULUM_GENERATION_PROMPT } = await import('@/lib/llm/prompts');

  const provider = createProvider(llmProvider);
  const model = llmProvider.type === 'anthropic'
    ? provider.languageModel(llmProvider.model)
    : (provider as ReturnType<typeof import('@ai-sdk/openai').createOpenAI>).chat(llmProvider.model);

  // First, run community search to get web content for the LLM
  onProgress?.({
    stage: 'sourcing',
    message: 'Searching the web for supplementary insights...',
    progress: 40,
  });

  const communitySearchResults = await Promise.allSettled(
    searchQueries.map((query) => searchInternetSources(query))
  );

  const communitySources: CommunitySource[] = [];
  for (const result of communitySearchResults) {
    if (result.status === 'fulfilled') {
      communitySources.push(...result.value.sources);
    }
  }

  // Format web content with URLs for citation
  const webContent = communitySources.length > 0
    ? communitySources
        .slice(0, 8) // Limit to 8 best web sources
        .map((s) => `[Web Source: ${s.communityName}] (${s.url})\n${s.content}`)
        .join('\n\n')
    : '';

  onProgress?.({
    stage: 'building',
    message: 'Creating your personalized learning journey...',
    progress: 55,
  });

  const userPrompt = `Topic: "${topic}"

Transform the source material below into an engaging, creative learning journey. DO NOT reproduce the table of contents. DO NOT use page numbers. DO NOT make it feel like reading a textbook.

Instead, teach every concept in an exciting, story-like way. Use analogies, real-world scenarios, "what if" questions, and progressive revelation. The goal is to help someone who is anxious about reading books learn everything from these materials without it feeling like a book.

CRITICAL: For EVERY factual statement, cite your source using [Doc: section title] or [Web: source name]. If you cannot cite a source, do not include the claim.

${meaningfulSections.length > 200 ? `--- DOCUMENT CONTENT (cite as [Doc: section title]) ---\n${meaningfulSections.slice(0, 35000)}` : `--- DOCUMENT CONTENT ---\n${meaningfulSections}\n\nNote: Limited content was extracted. Create the journey based ONLY on the content above.`}

${webContent ? `\n--- WEB SOURCES (cite as [Web: source name]) ---\n${webContent.slice(0, 8000)}` : ''}

Remember:
- Create 15-25 sections that teach ALL key concepts from the documents
- Enrich with web sources where they add value (practical tips, real-world examples)
- Each section: 200-400 words with inline citations [Doc: ...] or [Web: ...]
- Creative titles that spark curiosity
- Start with a hook, build progressively
- Include quizzes every 4-5 sections (2-3 multiple choice questions with correct answer and explanation)
- Make it feel like a conversation, not a textbook`;

  // Run LLM generation
  const [llmResult] = await Promise.allSettled([
    generateText({
      model,
      system: CURRICULUM_GENERATION_PROMPT,
      prompt: userPrompt,
      maxRetries: 1,
    }),
  ]);

  onProgress?.({
    stage: 'building',
    message: 'Assembling your journey...',
    progress: 75,
  });

  // Build verified sources from community search results for attribution
  let verifiedSources: VerifiedSource[] = communitySources
    .filter((s) => s.content.length > 50)
    .map((s) => ({
      url: s.url,
      title: s.communityName,
      content: s.content,
      communityName: s.communityName,
      confidenceLevel: 'High' as const, // Tavily results are pre-vetted
    }));

  // Process LLM result
  let sections: JourneySection[];

  if (llmResult.status === 'fulfilled') {
    sections = parseLLMJourneyResponse(llmResult.value.text, verifiedSources);
  } else {
    console.error('LLM journey generation failed:', llmResult.reason);
    sections = buildJourneyStructure(contentSections, verifiedSources);
  }

  // --- Stage 5: Finalize sections (quizzes included inline from LLM) ---
  onProgress?.({
    stage: 'quizzing',
    message: 'Finalizing content...',
    progress: 80,
  });

  // --- Stage 6: Integrate sources with proper attribution ---
  sections = integrateSources(sections, verifiedSources);

  // Tag document-sourced sections that don't have attribution
  sections = sections.map((section) => {
    if (section.sourceTag === 'Document-sourced' && !section.attribution && documents && documents.length > 0) {
      return {
        ...section,
        attribution: {
          name: documents[0].fileName,
          type: 'document' as const,
        },
      };
    }
    return section;
  });

  // Collect all source attributions
  const allAttributions = collectAttributions(sections);

  // --- Stage 7: Persist to database ---
  onProgress?.({
    stage: 'persisting',
    message: 'Saving journey...',
    progress: 85,
  });

  const journeyId = randomUUID();
  const createdAt = new Date();

  const journey: Journey = {
    id: journeyId,
    topic,
    sections,
    totalSections: sections.length,
    createdAt,
    sources: allAttributions,
  };

  // Persist journey and sections to SQLite
  await persistJourney(journey);

  // --- Complete ---
  onProgress?.({
    stage: 'complete',
    message: 'Journey generation complete!',
    progress: 100,
    partialJourney: journey,
  });

  return journey;
}

/**
 * Parses the LLM's JSON response into JourneySection objects.
 * Handles markdown code blocks, malformed JSON, and validates structure.
 */
function parseLLMJourneyResponse(
  responseText: string,
  verifiedSources: VerifiedSource[]
): JourneySection[] {
  // Try to extract JSON from the response
  let jsonStr = responseText.trim();

  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const rawSections = parsed.sections || parsed;

    if (!Array.isArray(rawSections) || rawSections.length === 0) {
      throw new Error('No sections in response');
    }

    return rawSections.map((s: Record<string, unknown>, index: number): JourneySection => ({
      id: randomUUID(),
      title: typeof s.title === 'string' ? s.title : `Section ${index + 1}`,
      content: typeof s.content === 'string' ? s.content : '',
      order: index + 1,
      sourceTag: s.sourceTag === 'Internet-sourced' ? 'Internet-sourced' : 'Document-sourced',
      confidenceLevel: s.sourceTag === 'Internet-sourced'
        ? (verifiedSources[0]?.confidenceLevel ?? 'Medium')
        : undefined,
      relatedSections: Array.isArray(s.relatedSections) ? s.relatedSections as string[] : [],
      attribution: s.sourceTag === 'Internet-sourced' && verifiedSources.length > 0
        ? { name: verifiedSources[0].communityName, url: verifiedSources[0].url, type: 'community' as const }
        : undefined,
    }));
  } catch {
    // If JSON parsing fails entirely, try to extract sections from plain text
    const textSections = responseText.split(/(?=##\s)/).filter((s) => s.trim().length > 50);

    if (textSections.length >= 3) {
      return textSections.map((text, index): JourneySection => {
        const lines = text.trim().split('\n');
        const title = lines[0]?.replace(/^#+\s*/, '').trim() || `Section ${index + 1}`;
        const content = lines.slice(1).join('\n').trim();

        return {
          id: randomUUID(),
          title,
          content,
          order: index + 1,
          sourceTag: 'Document-sourced',
          relatedSections: [],
        };
      });
    }

    // Last resort: return the whole response as one section
    return [{
      id: randomUUID(),
      title: 'Learning Journey',
      content: responseText,
      order: 1,
      sourceTag: 'Document-sourced',
      relatedSections: [],
    }];
  }
}

/**
 * Persists a Journey and its sections to the database.
 */
async function persistJourney(journey: Journey): Promise<void> {
  await prisma.journey.create({
    data: {
      id: journey.id,
      topic: journey.topic,
      createdAt: journey.createdAt,
      sections: {
        create: journey.sections.map((section) => ({
          id: section.id,
          title: section.title,
          content: section.content,
          order: section.order,
          sourceTag: section.sourceTag,
          confidenceLevel: section.confidenceLevel ?? null,
          attributionName: section.attribution?.name ?? null,
          attributionUrl: section.attribution?.url ?? null,
          quizData: section.quiz ? JSON.stringify(section.quiz) : null,
        })),
      },
    },
  });
}

/**
 * Creates a ReadableStream that emits journey generation progress events
 * for server-sent events (SSE) based progressive rendering.
 */
export function createJourneyStream(
  params: JourneyGenerationParams
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const journey = await generateJourney(params, (event) => {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        });

        // Send final complete event with full journey
        const completeEvent = JSON.stringify({
          stage: 'complete',
          message: 'Journey generation complete!',
          progress: 100,
          partialJourney: journey,
        });
        controller.enqueue(encoder.encode(`data: ${completeEvent}\n\n`));
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Journey generation failed';
        const errorEvent = JSON.stringify({
          stage: 'complete',
          message: errorMessage,
          progress: -1,
          error: true,
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        controller.close();
      }
    },
  });
}

/**
 * Builds creative, non-linear section ordering from extracted concepts.
 * Ensures ordering differs from source document TOC.
 */
export { buildJourneyStructure } from './journey-builder';

/**
 * Determines quiz insertion points (every 3-5 concepts).
 */
export { planQuizInsertion } from './quiz-generator';
export { generateQuizForSection } from './quiz-generator';
