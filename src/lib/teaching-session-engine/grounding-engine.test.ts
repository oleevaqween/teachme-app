import { describe, it, expect, vi } from 'vitest';
import { buildGroundedPrompt, type WebSource } from './grounding-engine';
import type { ContentChunk } from '@/lib/journey-map-generator';
import type { TeachingMessage } from './index';

function makeChunk(overrides: Partial<ContentChunk> = {}): ContentChunk {
  return {
    id: 'chunk-1',
    stageId: 'stage-1',
    journeyId: 'journey-1',
    content: 'JavaScript is a dynamic programming language used for web development.',
    sourceDocument: 'js-guide.pdf',
    sourceSection: 'Introduction',
    order: 1,
    wordCount: 10,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<TeachingMessage> = {}): TeachingMessage {
  return {
    id: 'msg-1',
    stageId: 'stage-1',
    journeyId: 'journey-1',
    role: 'user',
    content: 'Tell me about JavaScript',
    sources: [],
    messageType: 'qa',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('buildGroundedPrompt', () => {
  it('includes content from every provided chunk in the system prompt', async () => {
    const chunks: ContentChunk[] = [
      makeChunk({ id: 'c1', content: 'Variables store data values.', sourceDocument: 'basics.pdf', sourceSection: 'Variables' }),
      makeChunk({ id: 'c2', content: 'Functions are reusable blocks of code.', sourceDocument: 'basics.pdf', sourceSection: 'Functions' }),
      makeChunk({ id: 'c3', content: 'Objects group related data and behavior.', sourceDocument: 'advanced.pdf', sourceSection: 'Objects' }),
    ];

    const result = await buildGroundedPrompt(chunks, 'What are variables?', []);

    // Property 10: every chunk's content must appear in the systemPrompt
    for (const chunk of chunks) {
      expect(result.systemPrompt).toContain(chunk.content);
    }
  });

  it('returns all provided chunks in contextChunks', async () => {
    const chunks = [makeChunk({ id: 'c1' }), makeChunk({ id: 'c2' })];
    const result = await buildGroundedPrompt(chunks, 'Hello', []);

    expect(result.contextChunks).toEqual(chunks);
  });

  it('includes anti-hallucination instructions', async () => {
    const result = await buildGroundedPrompt([makeChunk()], 'Explain this', []);

    expect(result.instructions).toContain('GROUNDING RULES');
    expect(result.instructions).toContain('[Document: <filename>]');
    expect(result.instructions).toContain('[Web: <source name>]');
    expect(result.instructions).toContain('[General Knowledge]');
    expect(result.systemPrompt).toContain('GROUNDING RULES');
  });

  it('includes source attribution instructions with correct format', async () => {
    const result = await buildGroundedPrompt([makeChunk()], 'Explain this', []);

    expect(result.instructions).toContain('[Document: <filename>]');
    expect(result.instructions).toContain('[Web: <source name>]');
  });

  it('calls tavilySearch when user question exceeds chunk content', async () => {
    const chunks = [makeChunk({ content: 'JavaScript is a dynamic programming language used for web development.' })];
    const mockTavily = vi.fn().mockResolvedValue([
      { title: 'Kubernetes Docs', url: 'https://k8s.io', content: 'Kubernetes orchestrates containers at scale.', retrievedAt: new Date() },
    ] satisfies WebSource[]);

    // Ask about something completely unrelated to the chunk content
    const result = await buildGroundedPrompt(chunks, 'How does Kubernetes handle container orchestration?', [], mockTavily);

    expect(mockTavily).toHaveBeenCalledWith('How does Kubernetes handle container orchestration?');
    expect(result.webSources).toHaveLength(1);
    expect(result.webSources[0].title).toBe('Kubernetes Docs');
    expect(result.systemPrompt).toContain('Kubernetes orchestrates containers at scale.');
  });

  it('always calls tavilySearch when provided, regardless of chunk overlap', async () => {
    const chunks = [
      makeChunk({ content: 'JavaScript variables can store numbers, strings, and objects. Variables are declared with let or const keywords.' }),
    ];
    const mockTavily = vi.fn().mockResolvedValue([]);

    await buildGroundedPrompt(chunks, 'Tell me about JavaScript variables', [], mockTavily);

    expect(mockTavily).toHaveBeenCalledWith('Tell me about JavaScript variables');
  });

  it('handles tavilySearch timeout gracefully (returns empty webSources)', async () => {
    const chunks = [makeChunk({ content: 'Basic content here.' })];
    // Mock that never resolves (simulates timeout)
    const mockTavily = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ title: 'Late', url: 'x', content: 'y', retrievedAt: new Date() }]), 15_000))
    );

    const result = await buildGroundedPrompt(chunks, 'What is quantum computing?', [], mockTavily);

    // Should gracefully degrade with empty web sources (timeout at 10s)
    expect(result.webSources).toEqual([]);
    expect(result.contextChunks).toEqual(chunks);
  }, 12_000);

  it('handles tavilySearch errors gracefully', async () => {
    const chunks = [makeChunk({ content: 'Some content about math.' })];
    const mockTavily = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await buildGroundedPrompt(chunks, 'What is calculus?', [], mockTavily);

    expect(result.webSources).toEqual([]);
    expect(result.contextChunks).toEqual(chunks);
  });

  it('works with empty chunks and no tavilySearch', async () => {
    const result = await buildGroundedPrompt([], 'Hello there', []);

    expect(result.contextChunks).toEqual([]);
    expect(result.webSources).toEqual([]);
    expect(result.instructions).toContain('GROUNDING RULES');
  });

  it('includes conversation history count in the prompt', async () => {
    const history = [
      makeMessage({ id: 'm1', role: 'user', content: 'Hi' }),
      makeMessage({ id: 'm2', role: 'assistant', content: 'Hello!' }),
    ];

    const result = await buildGroundedPrompt([makeChunk()], 'Next topic', history);

    expect(result.systemPrompt).toContain('2 prior message(s)');
  });

  it('includes document source annotations in the chunk context', async () => {
    const chunk = makeChunk({ sourceDocument: 'my-file.pdf', sourceSection: 'Chapter 1' });
    const result = await buildGroundedPrompt([chunk], 'Explain', []);

    expect(result.systemPrompt).toContain('[Document: my-file.pdf, Section: Chapter 1]');
  });
});
