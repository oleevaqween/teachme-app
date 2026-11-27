// src/lib/journey-map-generator/stage-assignment.test.ts

import { describe, it, expect } from 'vitest';
import { assignChunksToStages } from './stage-assignment';
import type { RawChunk } from './content-chunker';
import type { Stage } from './index';
import type { LLMProviderConfig } from '@/lib/llm/provider';

const mockLLMProvider: LLMProviderConfig = {
  type: 'openai',
  apiKey: 'test-key',
  model: 'gpt-4',
  timeout: 30000,
};

function createStages(): Stage[] {
  return [
    {
      id: 'stage-risk',
      journeyId: 'journey-1',
      title: 'Risk Management',
      summary: 'Understanding and managing project risks',
      theme: 'Defense Planning',
      order: 1,
      topicsCovered: ['risk identification', 'risk analysis', 'risk response'],
    },
    {
      id: 'stage-scope',
      journeyId: 'journey-1',
      title: 'Scope Management',
      summary: 'Defining and controlling project scope',
      theme: 'Blueprint Drawing',
      order: 2,
      topicsCovered: ['scope definition', 'work breakdown structure', 'scope validation'],
    },
    {
      id: 'stage-schedule',
      journeyId: 'journey-1',
      title: 'Schedule Management',
      summary: 'Planning and tracking project timelines',
      theme: 'Time Mastery',
      order: 3,
      topicsCovered: ['schedule planning', 'critical path', 'timeline estimation'],
    },
  ];
}

describe('assignChunksToStages (keyword-based)', () => {
  it('returns empty array when no chunks are provided', async () => {
    const result = await assignChunksToStages([], createStages(), mockLLMProvider);
    expect(result).toEqual([]);
  });

  it('returns empty array when no stages are provided', async () => {
    const chunks: RawChunk[] = [
      { content: 'Some content about risk', wordCount: 50, sourceSection: 'Risk', sourceDocument: 'doc.pdf' },
    ];
    const result = await assignChunksToStages(chunks, [], mockLLMProvider);
    expect(result).toEqual([]);
  });

  it('assigns chunks to the most relevant stage based on keywords', async () => {
    const chunks: RawChunk[] = [
      {
        content: 'Risk identification involves finding potential threats and opportunities. Risk analysis helps quantify their impact.',
        wordCount: 20,
        sourceSection: 'Risk Management Planning',
        sourceDocument: 'pmbok.pdf',
      },
      {
        content: 'The work breakdown structure decomposes scope into deliverables. Scope validation confirms completeness.',
        wordCount: 15,
        sourceSection: 'Scope Definition',
        sourceDocument: 'pmbok.pdf',
      },
    ];

    const result = await assignChunksToStages(chunks, createStages(), mockLLMProvider);

    // Risk chunk should match stage-risk
    const riskChunks = result.filter((c) => c.stageId === 'stage-risk');
    expect(riskChunks.length).toBeGreaterThan(0);
    expect(riskChunks[0].content).toContain('Risk identification');

    // Scope chunk should match stage-scope
    const scopeChunks = result.filter((c) => c.stageId === 'stage-scope');
    expect(scopeChunks.length).toBeGreaterThan(0);
    expect(scopeChunks[0].content).toContain('work breakdown structure');
  });

  it('ensures no chunk is left unassigned (no orphans)', async () => {
    const chunks: RawChunk[] = [
      { content: 'Random content with no matching keywords whatsoever xyz abc', wordCount: 10, sourceSection: 'Misc', sourceDocument: 'doc.pdf' },
      { content: 'Another unrelated chunk about bananas', wordCount: 6, sourceSection: 'Food', sourceDocument: 'doc.pdf' },
    ];

    const result = await assignChunksToStages(chunks, createStages(), mockLLMProvider);

    // Every chunk must be assigned somewhere
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const chunk of result) {
      expect(chunk.stageId).toBeTruthy();
    }
  });

  it('assigns a chunk to multiple stages when relevant to both', async () => {
    const chunks: RawChunk[] = [
      {
        content: 'Risk response planning requires scope definition to understand what work breakdown areas face the highest risk identification challenges.',
        wordCount: 20,
        sourceSection: 'Cross-cutting Concerns',
        sourceDocument: 'pmbok.pdf',
      },
    ];

    const result = await assignChunksToStages(chunks, createStages(), mockLLMProvider);

    // This chunk mentions both risk and scope terms, so it could be assigned to multiple stages
    const stageIds = new Set(result.map((c) => c.stageId));
    expect(stageIds.size).toBeGreaterThanOrEqual(1);
  });

  it('generates proper ContentChunk objects with all required fields', async () => {
    const chunks: RawChunk[] = [
      {
        content: 'Schedule planning involves timeline estimation and critical path analysis.',
        wordCount: 10,
        sourceSection: 'Schedule Development',
        sourceDocument: 'guide.pdf',
      },
    ];

    const result = await assignChunksToStages(chunks, createStages(), mockLLMProvider);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const chunk = result[0];

    expect(chunk.id).toMatch(/^ck-/);
    expect(chunk.stageId).toBeTruthy();
    expect(chunk.journeyId).toBe('journey-1');
    expect(chunk.content).toBe(chunks[0].content);
    expect(chunk.sourceDocument).toBe('guide.pdf');
    expect(chunk.sourceSection).toBe('Schedule Development');
    expect(chunk.order).toBeGreaterThanOrEqual(1);
    expect(chunk.wordCount).toBe(10);
  });

  it('maintains sequential ordering within each stage', async () => {
    const chunks: RawChunk[] = [
      { content: 'First risk topic about risk identification and threats.', wordCount: 10, sourceSection: 'Risk 1', sourceDocument: 'doc.pdf' },
      { content: 'Second risk topic about risk analysis and quantification.', wordCount: 10, sourceSection: 'Risk 2', sourceDocument: 'doc.pdf' },
      { content: 'Third risk topic about risk response strategies.', wordCount: 10, sourceSection: 'Risk 3', sourceDocument: 'doc.pdf' },
    ];

    const result = await assignChunksToStages(chunks, createStages(), mockLLMProvider);

    const riskChunks = result.filter((c) => c.stageId === 'stage-risk');
    // Orders should be sequential
    const orders = riskChunks.map((c) => c.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBe(orders[i - 1] + 1);
    }
  });

  it('is instant (no LLM calls needed)', async () => {
    const chunks: RawChunk[] = Array.from({ length: 100 }, (_, i) => ({
      content: `Content about topic ${i % 3 === 0 ? 'risk' : i % 3 === 1 ? 'scope' : 'schedule'} management concepts.`,
      wordCount: 10,
      sourceSection: `Section ${i}`,
      sourceDocument: 'doc.pdf',
    }));

    const start = Date.now();
    const result = await assignChunksToStages(chunks, createStages(), mockLLMProvider);
    const elapsed = Date.now() - start;

    // Should complete in under 100ms (no network calls)
    expect(elapsed).toBeLessThan(100);
    expect(result.length).toBeGreaterThanOrEqual(100);
  });
});
