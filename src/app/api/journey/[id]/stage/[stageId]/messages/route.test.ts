import { describe, it, expect } from 'vitest';

function parseMessage(raw: {
  id: string;
  stageId: string;
  journeyId: string;
  role: string;
  content: string;
  sources: string | null;
  messageType: string;
  createdAt: Date;
}) {
  return {
    id: raw.id,
    stageId: raw.stageId,
    journeyId: raw.journeyId,
    role: raw.role,
    content: raw.content,
    sources: raw.sources ? JSON.parse(raw.sources) : [],
    messageType: raw.messageType as 'lecture' | 'qa',
    createdAt: raw.createdAt,
  };
}

describe('messages route parseMessage', () => {
  it('includes messageType in parsed output', () => {
    const raw = {
      id: 'msg-1',
      stageId: 's1',
      journeyId: 'j1',
      role: 'assistant',
      content: 'Hello',
      sources: null,
      messageType: 'lecture',
      createdAt: new Date(),
    };

    const result = parseMessage(raw);
    expect(result.messageType).toBe('lecture');
  });

  it('passes through qa messageType correctly', () => {
    const raw = {
      id: 'msg-2',
      stageId: 's1',
      journeyId: 'j1',
      role: 'assistant',
      content: 'Answer',
      sources: null,
      messageType: 'qa',
      createdAt: new Date(),
    };

    const result = parseMessage(raw);
    expect(result.messageType).toBe('qa');
  });

  it('parses sources correctly alongside messageType', () => {
    const sources = [{ type: 'document', name: 'guide.pdf' }];
    const raw = {
      id: 'msg-3',
      stageId: 's1',
      journeyId: 'j1',
      role: 'assistant',
      content: 'Content',
      sources: JSON.stringify(sources),
      messageType: 'lecture',
      createdAt: new Date(),
    };

    const result = parseMessage(raw);
    expect(result.sources).toEqual(sources);
    expect(result.messageType).toBe('lecture');
  });
});
