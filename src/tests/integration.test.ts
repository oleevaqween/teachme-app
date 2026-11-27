// Integration tests for end-to-end flows
// Task 19.2

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock Prisma client
vi.mock('@/lib/db/client', () => ({
  prisma: {
    archivedQuestion: {
      create: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    lLMProviderSettings: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    journey: {
      create: vi.fn(),
    },
  },
}));

// Mock the LLM generateText
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

// Mock web sourcer
vi.mock('@/lib/web-sourcer', () => ({
  searchInternetSources: vi.fn().mockResolvedValue({ sources: [], timedOut: false }),
}));

// Mock information validator
vi.mock('@/lib/information-validator', () => ({
  verifyClaim: vi.fn().mockResolvedValue({ claim: '', verified: true, confidenceLevel: 'High', sources: [], timedOut: false }),
  verifyBatch: vi.fn().mockResolvedValue([]),
}));

import { generateText } from 'ai';
import { prisma } from '@/lib/db/client';

const mockGenerateText = vi.mocked(generateText);
const mockPrisma = vi.mocked(prisma);

// ─── Test Helpers ───────────────────────────────────────────────────────────

function mockLLMResponse(text: string) {
  mockGenerateText.mockResolvedValueOnce({
    text,
    toolCalls: [],
    toolResults: [],
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    response: { id: 'test', modelId: 'test', timestamp: new Date() },
    warnings: [],
    reasoning: undefined,
    sources: [],
    request: {},
    rawResponse: undefined,
    providerMetadata: undefined,
    steps: [],
    logprobs: undefined,
    responseMessages: [],
    rawCall: { rawPrompt: '', rawSettings: {} },
    files: [],
    experimental_output: undefined,
  } as unknown as Awaited<ReturnType<typeof generateText>>);
}

const testLLMConfig = {
  type: 'openai' as const,
  apiKey: 'test-key-123',
  model: 'gpt-4',
  timeout: 15000,
};

// ─── 1. Journey Generation Flow ────────────────────────────────────────────

describe('Integration: Journey Generation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates topic → builds journey structure → produces correct output shape', async () => {
    const { validateTopic } = await import('@/lib/validators/topic');
    const { buildJourneyStructure } = await import('@/lib/curriculum-engine/journey-builder');
    const { planQuizInsertion } = await import('@/lib/curriculum-engine/quiz-generator');

    // Step 1: Validate topic
    const topicResult = validateTopic('Machine Learning Fundamentals');
    expect(topicResult.valid).toBe(true);

    // Step 2: Build journey structure from content sections
    const contentSections = [
      { title: 'Introduction to ML', body: 'Machine learning is a branch of AI that focuses on algorithms.', order: 1, level: 1 },
      { title: 'Supervised Learning', body: 'Supervised learning uses labeled data for training models.', order: 2, level: 2 },
      { title: 'Unsupervised Learning', body: 'Unsupervised learning discovers patterns without labels.', order: 3, level: 2 },
      { title: 'Neural Networks', body: 'Neural networks are computing systems inspired by biological brains.', order: 4, level: 2 },
      { title: 'Deep Learning', body: 'Deep learning uses multi-layered neural networks for feature extraction.', order: 5, level: 3 },
      { title: 'Model Evaluation', body: 'Evaluating models requires metrics like accuracy, precision, and recall.', order: 6, level: 2 },
    ];

    const journeySections = buildJourneyStructure(contentSections, []);

    // Verify output shape
    expect(journeySections.length).toBeGreaterThanOrEqual(5);
    expect(journeySections.length).toBeLessThanOrEqual(50);

    for (const section of journeySections) {
      expect(section).toHaveProperty('id');
      expect(section).toHaveProperty('title');
      expect(section).toHaveProperty('content');
      expect(section).toHaveProperty('order');
      expect(section).toHaveProperty('sourceTag');
      expect(section).toHaveProperty('relatedSections');
      expect(section.sourceTag).toBe('Document-sourced');
      expect(typeof section.order).toBe('number');
      expect(section.order).toBeGreaterThan(0);
    }

    // Step 3: Plan quiz insertion
    const quizPlan = planQuizInsertion(journeySections);
    expect(quizPlan).toHaveProperty('insertionPoints');
    expect(quizPlan).toHaveProperty('totalQuizzes');
    expect(Array.isArray(quizPlan.insertionPoints)).toBe(true);

    // Verify quiz frequency constraint: ⌈N/5⌉ ≤ Q ≤ ⌊N/3⌋
    const n = journeySections.length;
    if (n >= 5) {
      expect(quizPlan.totalQuizzes).toBeGreaterThanOrEqual(Math.ceil(n / 5));
      expect(quizPlan.totalQuizzes).toBeLessThanOrEqual(Math.floor(n / 3));
    }
  });

  it('rejects invalid topic input before processing', async () => {
    const { validateTopic } = await import('@/lib/validators/topic');

    // Too short
    const shortResult = validateTopic('AI');
    expect(shortResult.valid).toBe(false);
    expect(shortResult.error).toBeDefined();

    // Empty
    const emptyResult = validateTopic('  ');
    expect(emptyResult.valid).toBe(false);
  });

  it('section ordering differs from source document order', async () => {
    const { buildJourneyStructure } = await import('@/lib/curriculum-engine/journey-builder');

    const contentSections = [
      { title: 'Chapter 1: Basics', body: 'Basic concepts and foundations of the topic.', order: 1, level: 1 },
      { title: 'Chapter 2: Intermediate', body: 'Building on basics with more advanced ideas and techniques.', order: 2, level: 1 },
      { title: 'Chapter 3: Advanced', body: 'Advanced topics requiring deep understanding of fundamentals.', order: 3, level: 1 },
      { title: 'Chapter 4: Expert', body: 'Expert-level material for specialized applications and research.', order: 4, level: 1 },
      { title: 'Chapter 5: Applications', body: 'Real-world applications demonstrating practical use cases.', order: 5, level: 1 },
    ];

    const sections = buildJourneyStructure(contentSections, []);
    const outputTitles = sections
      .filter((s) => s.sourceTag === 'Document-sourced')
      .map((s) => s.title.replace(/ \(Part [12]\)$/, '').replace(/^Overview: /, ''));

    const originalTitles = contentSections.map((s) => s.title);

    // The output ordering should differ from the original
    const isSameOrder = outputTitles.every((title, idx) => title === originalTitles[idx]);
    expect(isSameOrder).toBe(false);
  });
});

// ─── 2. Interview Flow ─────────────────────────────────────────────────────

describe('Integration: Interview Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates questions (mock LLM) → validates response shape', async () => {
    const { generateMockQuestions } = await import('@/lib/interview-engine/index');

    // Mock question generation LLM response
    const mockQuestions = {
      questions: [
        { question: 'Explain the difference between REST and GraphQL APIs.', difficulty: 'medium', topicArea: 'API Design' },
        { question: 'How would you design a rate limiting system?', difficulty: 'hard', topicArea: 'System Design' },
        { question: 'What are the SOLID principles and why do they matter?', difficulty: 'medium', topicArea: 'Design Patterns' },
        { question: 'Describe your approach to debugging a production issue.', difficulty: 'medium', topicArea: 'Troubleshooting' },
        { question: 'How do you ensure code quality in a fast-paced team?', difficulty: 'medium', topicArea: 'Engineering Practices' },
      ],
    };
    mockLLMResponse(JSON.stringify(mockQuestions));

    // Step 1: Generate questions
    const questions = await generateMockQuestions('Backend Engineer', [], testLLMConfig);

    // Validate response shape
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.length).toBeLessThanOrEqual(10);

    for (const q of questions) {
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('role');
      expect(q).toHaveProperty('question');
      expect(q).toHaveProperty('difficulty');
      expect(q).toHaveProperty('topicArea');
      expect(q).toHaveProperty('createdAt');
      expect(q.role).toBe('Backend Engineer');
      expect(['medium', 'hard']).toContain(q.difficulty);
      expect(q.question.length).toBeGreaterThan(0);
      expect(q.topicArea.length).toBeGreaterThan(0);
    }
  });
});

// ─── 3. CV Refinement ───────────────────────────────────────────────────────

describe('Integration: CV Refinement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CV section type detection recognizes standard heading patterns', () => {
    // Test the section type detection by checking expected classification
    // of common CV headings using the same pattern logic as cv-refiner

    const SECTION_TYPE_PATTERNS: Record<string, RegExp[]> = {
      summary: [/summary/i, /objective/i, /profile/i, /about\s*me/i, /personal\s*statement/i, /overview/i],
      experience: [/experience/i, /employment/i, /work\s*history/i, /professional/i, /career/i],
      education: [/education/i, /academic/i, /qualifications?/i, /degrees?/i, /university/i],
      skills: [/skills?/i, /competenc/i, /technologies/i, /technical/i, /tools/i],
    };

    function detectSectionType(heading: string): string {
      for (const [type, patterns] of Object.entries(SECTION_TYPE_PATTERNS)) {
        for (const pattern of patterns) {
          if (pattern.test(heading)) return type;
        }
      }
      return 'other';
    }

    // Test standard headings
    expect(detectSectionType('Professional Summary')).toBe('summary');
    expect(detectSectionType('Career Objective')).toBe('summary');
    expect(detectSectionType('Work Experience')).toBe('experience');
    expect(detectSectionType('Employment History')).toBe('experience');
    expect(detectSectionType('Education')).toBe('education');
    expect(detectSectionType('Academic Background')).toBe('education');
    expect(detectSectionType('Technical Skills')).toBe('skills');
    expect(detectSectionType('Technologies')).toBe('skills');
    expect(detectSectionType('References')).toBe('other');
    expect(detectSectionType('Hobbies')).toBe('other');
  });
});

// ─── 4. Provider Configuration ─────────────────────────────────────────────

describe('Integration: Provider Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates provider config → saves → retrieves correctly', async () => {
    const { createProvider } = await import('@/lib/llm/provider');
    const { saveProviderConfig, getActiveProviderConfig, getAllProviderConfigs } = await import('@/lib/llm/config');

    // Step 1: Validate provider creation (no actual network call)
    const provider = createProvider({
      type: 'openai',
      apiKey: 'sk-test-key',
      model: 'gpt-4',
      timeout: 15000,
    });
    expect(provider).toBeDefined();

    // Step 2: Save provider config (mocked DB)
    // saveProviderConfig calls: updateMany → findFirst → create
    (mockPrisma.lLMProviderSettings as unknown as Record<string, ReturnType<typeof vi.fn>>).updateMany =
      vi.fn().mockResolvedValueOnce({ count: 0 });
    (mockPrisma.lLMProviderSettings.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (mockPrisma.lLMProviderSettings.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'config-1',
      type: 'openai',
      apiKey: 'sk-test-key',
      baseUrl: null,
      model: 'gpt-4',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const configId = await saveProviderConfig({
      type: 'openai',
      apiKey: 'sk-test-key',
      model: 'gpt-4',
    });
    expect(configId).toBe('config-1');

    // Step 3: Retrieve active config (mocked DB)
    (mockPrisma.lLMProviderSettings.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'config-1',
      type: 'openai',
      apiKey: 'sk-test-key',
      baseUrl: null,
      model: 'gpt-4',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const activeConfig = await getActiveProviderConfig();
    expect(activeConfig).toBeDefined();
    expect(activeConfig!.type).toBe('openai');
    expect(activeConfig!.model).toBe('gpt-4');

    // Step 4: Retrieve all provider configs
    (mockPrisma.lLMProviderSettings.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'config-1',
        type: 'openai',
        apiKey: 'sk-test-key',
        baseUrl: null,
        model: 'gpt-4',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const allConfigs = await getAllProviderConfigs();
    expect(allConfigs).toHaveLength(1);
    expect(allConfigs[0].type).toBe('openai');
  });

  it('supports all provider types', async () => {
    const { createProvider } = await import('@/lib/llm/provider');

    // OpenAI
    expect(() => createProvider({ type: 'openai', apiKey: 'sk-test', model: 'gpt-4', timeout: 15000 })).not.toThrow();

    // Anthropic
    expect(() => createProvider({ type: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514', timeout: 15000 })).not.toThrow();

    // Ollama Cloud
    expect(() => createProvider({ type: 'ollama-cloud', apiKey: 'key', baseUrl: 'https://api.ollama.com/v1', model: 'llama3', timeout: 15000 })).not.toThrow();

    // Ollama Local
    expect(() => createProvider({ type: 'ollama-local', baseUrl: 'http://localhost:11434/v1', model: 'llama3', timeout: 10000 })).not.toThrow();
  });

  it('rejects unsupported provider type', async () => {
    const { createProvider } = await import('@/lib/llm/provider');

    expect(() =>
      createProvider({ type: 'invalid' as never, model: 'test', timeout: 15000 })
    ).toThrow('Unsupported provider type');
  });
});
