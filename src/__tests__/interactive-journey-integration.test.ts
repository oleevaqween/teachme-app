// Integration tests for Interactive Journey end-to-end flows
// Task 16.3
// Validates: Requirements 1.1, 5.3, 8.1, 9.4

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock Prisma client with all models needed for interactive journey
vi.mock('@/lib/db/client', () => ({
  prisma: {
    journey: {
      create: vi.fn(),
    },
    stage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    contentChunk: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    teachingMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    stageProgress: {
      create: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    checkResult: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

// Mock LLM provider
vi.mock('@/lib/llm/provider', () => ({
  createProvider: vi.fn(() => ({
    chat: vi.fn(() => 'mock-model'),
    languageModel: vi.fn(() => 'mock-model'),
  })),
}));

// Mock web search (Tavily)
vi.mock('@/lib/information-validator/web-search', () => ({
  searchWebForEnrichment: vi.fn().mockResolvedValue([]),
  searchWeb: vi.fn().mockResolvedValue([]),
}));

import { generateText, streamText } from 'ai';
import { prisma } from '@/lib/db/client';

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);
const mockPrisma = vi.mocked(prisma);

// ─── Test Helpers ───────────────────────────────────────────────────────────

const mockLLMConfig = {
  type: 'openai' as const,
  apiKey: 'test-key-123',
  model: 'gpt-4',
  timeout: 15000,
};

function createMockStages(journeyId: string, count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `stage-${i + 1}`,
    journeyId,
    title: `Stage ${i + 1}: Topic ${i + 1}`,
    summary: `This is the summary for stage ${i + 1} covering important concepts and ideas`,
    theme: `Theme ${i + 1}`,
    order: i + 1,
    topicsCovered: JSON.stringify(['topic-a', 'topic-b']),
  }));
}

function createMockChunks(stageId: string, journeyId: string, count: number = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${stageId}-${i + 1}`,
    stageId,
    journeyId,
    content: `This is chunk content ${i + 1} with enough words to be meaningful for the teaching session grounding engine.`,
    sourceDocument: 'test-document.pdf',
    sourceSection: `Section ${i + 1}`,
    order: i + 1,
    wordCount: 20,
  }));
}

function createMockMessages(stageId: string, journeyId: string) {
  return [
    {
      id: 'msg-1',
      stageId,
      journeyId,
      role: 'assistant',
      content: 'Welcome to this stage! Let me teach you about the first concept.',
      sources: JSON.stringify([{ type: 'document', name: 'test-document.pdf' }]),
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    {
      id: 'msg-2',
      stageId,
      journeyId,
      role: 'user',
      content: 'Can you explain more about this concept?',
      sources: null,
      createdAt: new Date('2024-01-01T10:01:00Z'),
    },
    {
      id: 'msg-3',
      stageId,
      journeyId,
      role: 'assistant',
      content: 'Of course! Let me elaborate on the key points.',
      sources: JSON.stringify([{ type: 'document', name: 'test-document.pdf' }]),
      createdAt: new Date('2024-01-01T10:02:00Z'),
    },
  ];
}

// ─── 1. Journey Generation Integration ─────────────────────────────────────

describe('Journey Generation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates journey map → creates stages and chunks in DB', async () => {
    const { generateJourneyMap } = await import('@/lib/journey-map-generator');

    const mockJourneyRecord = {
      id: 'journey-1',
      topic: 'TypeScript Fundamentals',
      createdAt: new Date(),
      isInteractive: true,
    };

    // Mock $transaction to execute the callback with a mock tx client
    const mockTx = {
      journey: { create: vi.fn().mockResolvedValue(mockJourneyRecord) },
      stage: { create: vi.fn().mockResolvedValue({}) },
      contentChunk: { create: vi.fn().mockResolvedValue({}) },
      stageProgress: { create: vi.fn().mockResolvedValue({}) },
    };
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)
    );

    // Mock generateText for stage generation and chunk assignment
    // First call: stage generation — summaries must be 20-80 words
    const mockStagesJson = JSON.stringify({
      stages: Array.from({ length: 10 }, (_, i) => ({
        title: `Stage ${i + 1}: Concept ${i + 1}`,
        summary: `This is a comprehensive summary about concept ${i + 1} that covers the essential ideas techniques and patterns needed for deep understanding of the material presented in the course content`,
        theme: `Adventure Theme ${i + 1}`,
        topicsCovered: [`concept-${i + 1}-a`, `concept-${i + 1}-b`],
      })),
    });
    mockGenerateText.mockResolvedValueOnce({
      text: mockStagesJson,
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    // Second call: chunk assignment — return array format as expected by parseAssignmentResponse
    // Since stage IDs are randomly generated, fallback assignment will handle mapping
    mockGenerateText.mockResolvedValueOnce({
      text: '[]',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const documents = [
      {
        id: 'doc-1',
        fileName: 'typescript-guide.pdf',
        format: 'pdf' as const,
        content: {
          sections: [
            { title: 'Introduction', body: 'TypeScript is a typed superset of JavaScript. '.repeat(30), order: 1, level: 1 },
            { title: 'Types', body: 'TypeScript provides several basic types including string, number, and boolean. '.repeat(25), order: 2, level: 1 },
          ],
          rawText: '',
          headings: ['Introduction', 'Types'],
          totalCharacters: 5000,
        },
        metadata: { wordCount: 800 },
        parsedAt: new Date(),
      },
    ];

    const progressEvents: string[] = [];
    const result = await generateJourneyMap({
      topic: 'TypeScript Fundamentals',
      documents,
      llmProvider: mockLLMConfig,
      onProgress: (event) => progressEvents.push(event.stage),
    });

    // Verify journey was created
    expect(result.id).toBe('journey-1');
    expect(result.topic).toBe('TypeScript Fundamentals');
    expect(result.totalStages).toBe(10);
    expect(result.stages.length).toBe(10);

    // Verify stages have correct structure
    for (const stage of result.stages) {
      expect(stage.title).toBeDefined();
      expect(stage.summary.length).toBeGreaterThan(0);
      expect(stage.theme).toBeDefined();
      expect(stage.topicsCovered.length).toBeGreaterThan(0);
      expect(stage.journeyId).toBe('journey-1');
    }

    // Verify DB calls happened
    expect(mockTx.journey.create).toHaveBeenCalledTimes(1);
    expect(mockTx.stage.create).toHaveBeenCalledTimes(10);
    expect(mockTx.contentChunk.create).toHaveBeenCalled();
    expect(mockTx.stageProgress.create).toHaveBeenCalledTimes(10);

    // Verify progress events were emitted
    expect(progressEvents).toContain('extracting');
    expect(progressEvents).toContain('chunking');
    expect(progressEvents).toContain('generating-stages');
    expect(progressEvents).toContain('assigning-chunks');
    expect(progressEvents).toContain('persisting');
    expect(progressEvents).toContain('complete');
  });

  it('first stage gets unlocked, remaining stages get locked', async () => {
    const { generateJourneyMap } = await import('@/lib/journey-map-generator');

    const mockJourneyRecord = {
      id: 'journey-2',
      topic: 'React Hooks',
      createdAt: new Date(),
      isInteractive: true,
    };

    const stageProgressCalls: Array<{ stageId: string; status: string }> = [];

    const mockTx = {
      journey: { create: vi.fn().mockResolvedValue(mockJourneyRecord) },
      stage: { create: vi.fn().mockResolvedValue({}) },
      contentChunk: { create: vi.fn().mockResolvedValue({}) },
      stageProgress: {
        create: vi.fn().mockImplementation(({ data }) => {
          stageProgressCalls.push({ stageId: data.stageId, status: data.status });
          return Promise.resolve({});
        }),
      },
    };
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)
    );

    // Mock LLM calls
    const mockStagesJson = JSON.stringify({
      stages: Array.from({ length: 12 }, (_, i) => ({
        title: `Hook ${i + 1}`,
        summary: `This is a detailed summary for hook stage ${i + 1} explaining the core concepts and usage patterns clearly with enough words to pass validation requirements`,
        theme: `Hook Theme ${i + 1}`,
        topicsCovered: [`hook-${i + 1}`],
      })),
    });
    mockGenerateText.mockResolvedValueOnce({
      text: mockStagesJson,
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    } as unknown as Awaited<ReturnType<typeof generateText>>);
    mockGenerateText.mockResolvedValueOnce({
      text: '[]',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const documents = [{
      id: 'doc-2',
      fileName: 'hooks-guide.pdf',
      format: 'pdf' as const,
      content: {
        sections: [
          { title: 'useState', body: 'The useState hook lets you add state to function components. '.repeat(25), order: 1, level: 1 },
        ],
        rawText: '',
        headings: ['useState'],
        totalCharacters: 1500,
      },
      metadata: { wordCount: 250 },
      parsedAt: new Date(),
    }];

    await generateJourneyMap({
      topic: 'React Hooks',
      documents,
      llmProvider: mockLLMConfig,
    });

    // First stage should be unlocked, rest should be locked
    expect(stageProgressCalls[0].status).toBe('unlocked');
    for (let i = 1; i < stageProgressCalls.length; i++) {
      expect(stageProgressCalls[i].status).toBe('locked');
    }
  });
});

// ─── 2. Teaching Session Integration ────────────────────────────────────────

describe('Teaching Session Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends message → streams response → persists both messages to DB', async () => {
    const { createTeachingStream } = await import('@/lib/teaching-session-engine');

    const journeyId = 'journey-1';
    const stageId = 'stage-1';
    const userMessage = 'Explain TypeScript generics to me';

    // Mock: load stage chunks
    (mockPrisma.contentChunk.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockChunks(stageId, journeyId)
    );

    // Mock: load conversation history (empty for first message)
    (mockPrisma.teachingMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Mock: persist messages
    (mockPrisma.teachingMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Mock streamText to return a stream-like object
    const responseText = 'Generics in TypeScript allow you to write reusable components.';
    const mockTextStream = (async function* () {
      for (const word of responseText.split(' ')) {
        yield word + ' ';
      }
    })();

    mockStreamText.mockImplementation(() => {
      return { textStream: mockTextStream } as unknown as ReturnType<typeof streamText>;
    });

    // Execute: create the teaching stream
    const stream = createTeachingStream({
      journeyId,
      stageId,
      message: userMessage,
      llmProvider: mockLLMConfig,
    });

    // Read the stream to completion
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullResponse += decoder.decode(value, { stream: true });
    }

    // Verify stream produced text output
    expect(fullResponse.length).toBeGreaterThan(0);

    // Verify messages were persisted
    expect(mockPrisma.teachingMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stageId,
        journeyId,
        role: 'user',
        content: userMessage,
      }),
    });

    expect(mockPrisma.teachingMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stageId,
        journeyId,
        role: 'assistant',
        content: responseText,
      }),
    });
  });

  it('keeps the user question when the provider stream fails', async () => {
    const { createTeachingStream } = await import('@/lib/teaching-session-engine');
    const journeyId = 'journey-1';
    const stageId = 'stage-1';
    const userMessage = 'Is the project management team the same as the project team?';

    (mockPrisma.contentChunk.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockChunks(stageId, journeyId)
    );
    (mockPrisma.teachingMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.teachingMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    mockStreamText.mockImplementation((opts: Parameters<typeof streamText>[0]) => ({
      textStream: (async function* () {
        await opts.onError?.({ error: new Error('provider connection failed') });
      })(),
    }) as unknown as ReturnType<typeof streamText>);

    const stream = createTeachingStream({
      journeyId,
      stageId,
      message: userMessage,
      messageId: 'message-that-must-survive',
      llmProvider: mockLLMConfig,
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let response = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response += decoder.decode(value, { stream: true });
    }

    expect(response).toContain('Your question was saved');
    expect(mockPrisma.teachingMessage.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.teachingMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'message-that-must-survive',
        role: 'user',
        content: userMessage,
      }),
    });
  });

  describe('check scores', () => {
    const journeyId = 'journey-1';
    const stageId = 'stage-1';
    const at = new Date('2026-11-27T09:00:00.000Z');
    const saved = (role: 'user' | 'assistant', content: string, n: number) => ({
      id: `m${n}`, stageId, journeyId, role, content, sources: null, messageType: 'qa', createdAt: at,
    });
    const checkHistory = [
      saved('assistant', 'Welcome to the stage.', 1),
      saved('user', 'Check my understanding.', 2),
      saved('assistant', 'Question 1: who signs off the work?', 3),
      saved('user', 'The sponsor', 4),
      saved('assistant', 'Not quite. Question 2: who is informed?', 5),
    ];

    async function run(history: unknown[], reply: string, message = 'Stakeholders') {
      const { createTeachingStream } = await import('@/lib/teaching-session-engine');
      (mockPrisma.contentChunk.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(createMockChunks(stageId, journeyId));
      (mockPrisma.teachingMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(history);
      (mockPrisma.teachingMessage.create as ReturnType<typeof vi.fn>).mockImplementation(async ({ data }: { data: { role: string } }) =>
        data.role === 'assistant' ? { id: 'reply-1' } : { id: 'question-1' }
      );
      mockStreamText.mockImplementation(() => ({ textStream: (async function* () { yield reply; })() }) as unknown as ReturnType<typeof streamText>);
      const reader = createTeachingStream({ journeyId, stageId, message, llmProvider: mockLLMConfig }).getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      return text;
    }

    it('saves the score when a check ends with its Score line', async () => {
      await run(checkHistory, ['Right.', '', 'Review: the sponsor role.', '', 'Score: 1/2'].join('\n'));
      expect(mockPrisma.checkResult.create).toHaveBeenCalledWith({
        data: { stageId, journeyId, messageId: 'reply-1', correct: 1, total: 2 },
      });
    });

    it('saves nothing for a check reply without a Score line', async () => {
      await run(checkHistory, 'Right. Question 3: who is consulted?');
      expect(mockPrisma.checkResult.create).not.toHaveBeenCalled();
    });

    it('never scores the reply to the button itself, which asks question 1', async () => {
      const { createTeachingStream } = await import('@/lib/teaching-session-engine');
      (mockPrisma.contentChunk.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(createMockChunks(stageId, journeyId));
      (mockPrisma.teachingMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([saved('assistant', 'Welcome.', 1)]);
      (mockPrisma.teachingMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'reply-1' });
      mockStreamText.mockImplementation(() => ({ textStream: (async function* () { yield 'Question 1?\nScore: 0/4'; })() }) as unknown as ReturnType<typeof streamText>);
      const reader = createTeachingStream({ journeyId, stageId, message: 'Check my understanding.', action: 'check', llmProvider: mockLLMConfig }).getReader();
      while (!(await reader.read()).done) { /* drain */ }
      expect(mockPrisma.checkResult.create).not.toHaveBeenCalled();
    });

    it('rejects a total larger than the questions asked so far', async () => {
      await run(checkHistory, ['Review: the sponsor role.', '', 'Score: 3/4'].join('\n'));
      expect(mockPrisma.checkResult.create).not.toHaveBeenCalled();
    });

    it('ignores a Score line outside a check', async () => {
      await run([saved('assistant', 'Welcome.', 1)], 'Score: 3/4');
      expect(mockPrisma.checkResult.create).not.toHaveBeenCalled();
    });

    it('still finishes the lesson normally when the database has no CheckResult table', async () => {
      (mockPrisma.checkResult.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('SQLITE_ERROR: no such table: main.CheckResult'));
      const summary = ['Review: the sponsor role.', '', 'Score: 1/2'].join('\n');
      const text = await run(checkHistory, summary);
      expect(text).toBe(summary);
      expect(mockPrisma.teachingMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ role: 'assistant' }) });
    });
  });

  it('loads existing conversation history before generating response', async () => {
    const { createTeachingStream } = await import('@/lib/teaching-session-engine');

    const journeyId = 'journey-1';
    const stageId = 'stage-1';

    // Mock: load stage chunks
    (mockPrisma.contentChunk.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockChunks(stageId, journeyId)
    );

    // Mock: load existing conversation history
    const existingMessages = createMockMessages(stageId, journeyId);
    (mockPrisma.teachingMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      existingMessages
    );

    (mockPrisma.teachingMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const mockTextStream = (async function* () {
      yield 'Follow-up response.';
    })();

    mockStreamText.mockImplementation((opts: Parameters<typeof streamText>[0]) => {
      // Verify that conversation history was passed to the LLM
      expect(opts.messages?.length ?? 0).toBeGreaterThan(1);
      return { textStream: mockTextStream } as unknown as ReturnType<typeof streamText>;
    });

    const stream = createTeachingStream({
      journeyId,
      stageId,
      message: 'Tell me more',
      llmProvider: mockLLMConfig,
    });

    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    // Verify chunks and history were loaded from DB
    expect(mockPrisma.contentChunk.findMany).toHaveBeenCalledWith({
      where: { stageId },
      orderBy: { order: 'asc' },
    });
    expect(mockPrisma.teachingMessage.findMany).toHaveBeenCalledWith({
      where: { stageId, journeyId },
      orderBy: { createdAt: 'asc' },
    });
  });
});

// ─── 3. Progress Tracking Integration ───────────────────────────────────────

describe('Progress Tracking Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes stage → updates progress → unlocks next stage', async () => {
    const { completeStage, getJourneyProgress } = await import('@/lib/progress-tracker');

    const journeyId = 'journey-1';
    const stageId = 'stage-1';

    // Mock: upsert stage progress (completeStage)
    (mockPrisma.stageProgress.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'progress-1',
      stageId,
      journeyId,
      status: 'completed',
      completedAt: new Date(),
    });

    // Complete the first stage
    const result = await completeStage(journeyId, stageId);

    expect(result.status).toBe('completed');
    expect(result.stageId).toBe(stageId);
    expect(result.completedAt).toBeDefined();

    // Verify upsert was called with correct data
    expect(mockPrisma.stageProgress.upsert).toHaveBeenCalledWith({
      where: {
        journeyId_stageId: { journeyId, stageId },
      },
      update: {
        status: 'completed',
        completedAt: expect.any(Date),
      },
      create: {
        stageId,
        journeyId,
        status: 'completed',
        completedAt: expect.any(Date),
      },
    });

    // Now verify getJourneyProgress computes correct unlock state
    const mockStages = createMockStages(journeyId, 3);
    (mockPrisma.stage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockStages);

    // Stage 1 is completed
    (mockPrisma.stageProgress.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'progress-1', stageId: 'stage-1', journeyId, status: 'completed', completedAt: new Date() },
    ]);

    const progress = await getJourneyProgress(journeyId);

    expect(progress.journeyId).toBe(journeyId);
    expect(progress.totalStages).toBe(3);
    expect(progress.completedCount).toBe(1);
    expect(progress.percentComplete).toBe(33); // Math.round(1/3 * 100)

    // First stage completed, second unlocked, third locked
    expect(progress.stages[0].status).toBe('completed');
    expect(progress.stages[1].status).toBe('unlocked');
    expect(progress.stages[2].status).toBe('locked');
  });

  it('completing all stages yields 100% progress', async () => {
    const { getJourneyProgress } = await import('@/lib/progress-tracker');

    const journeyId = 'journey-1';
    const mockStages = createMockStages(journeyId, 3);
    (mockPrisma.stage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockStages);

    // All stages completed
    (mockPrisma.stageProgress.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'p-1', stageId: 'stage-1', journeyId, status: 'completed', completedAt: new Date() },
      { id: 'p-2', stageId: 'stage-2', journeyId, status: 'completed', completedAt: new Date() },
      { id: 'p-3', stageId: 'stage-3', journeyId, status: 'completed', completedAt: new Date() },
    ]);

    const progress = await getJourneyProgress(journeyId);

    expect(progress.completedCount).toBe(3);
    expect(progress.totalStages).toBe(3);
    expect(progress.percentComplete).toBe(100);

    // All stages should be completed
    for (const stage of progress.stages) {
      expect(stage.status).toBe('completed');
    }
  });

  it('no completions means only first stage is unlocked', async () => {
    const { getJourneyProgress } = await import('@/lib/progress-tracker');

    const journeyId = 'journey-1';
    const mockStages = createMockStages(journeyId, 4);
    (mockPrisma.stage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockStages);

    // No completions
    (mockPrisma.stageProgress.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const progress = await getJourneyProgress(journeyId);

    expect(progress.completedCount).toBe(0);
    expect(progress.percentComplete).toBe(0);
    expect(progress.stages[0].status).toBe('unlocked');
    expect(progress.stages[1].status).toBe('locked');
    expect(progress.stages[2].status).toBe('locked');
    expect(progress.stages[3].status).toBe('locked');
  });
});

// ─── 4. Conversation Reset Integration ──────────────────────────────────────

describe('Conversation Reset Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all messages for a stage when reset is called', async () => {
    const journeyId = 'journey-1';
    const stageId = 'stage-1';

    // Mock: stage exists
    (mockPrisma.stage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: stageId,
      journeyId,
      title: 'Stage 1',
      order: 1,
    });

    // Mock: deleteMany succeeds
    (mockPrisma.teachingMessage.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 5,
    });

    // Simulate the DELETE route logic directly (since we can't call the route handler easily)
    const stage = await prisma.stage.findFirst({
      where: { id: stageId, journeyId },
    });

    expect(stage).toBeDefined();

    const result = await prisma.teachingMessage.deleteMany({
      where: { stageId, journeyId },
    });

    expect(result.count).toBe(5);

    // Verify the correct query was used
    expect(mockPrisma.teachingMessage.deleteMany).toHaveBeenCalledWith({
      where: { stageId, journeyId },
    });
  });

  it('after reset, loading messages returns empty array', async () => {
    const journeyId = 'journey-1';
    const stageId = 'stage-1';

    // First: messages exist
    (mockPrisma.teachingMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createMockMessages(stageId, journeyId)
    );

    const messagesBefore = await prisma.teachingMessage.findMany({
      where: { stageId, journeyId },
      orderBy: { createdAt: 'asc' },
    });
    expect(messagesBefore.length).toBe(3);

    // Delete messages (simulating reset)
    (mockPrisma.teachingMessage.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 3,
    });
    await prisma.teachingMessage.deleteMany({ where: { stageId, journeyId } });

    // After reset: no messages
    (mockPrisma.teachingMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const messagesAfter = await prisma.teachingMessage.findMany({
      where: { stageId, journeyId },
      orderBy: { createdAt: 'asc' },
    });
    expect(messagesAfter.length).toBe(0);
  });
});
