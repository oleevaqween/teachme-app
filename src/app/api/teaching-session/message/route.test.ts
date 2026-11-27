import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  stream: vi.fn(), config: vi.fn(), search: vi.fn(),
  stageFind: vi.fn(), chunks: vi.fn(), history: vi.fn(), create: vi.fn(),
}));
vi.mock('ai', () => ({ streamText: mock.stream }));
vi.mock('@/lib/llm/config', () => ({ getActiveProviderConfig: mock.config }));
vi.mock('@/lib/llm/provider', () => ({ createProvider: () => ({ chat: () => 'test-model', languageModel: () => 'test-model' }) }));
vi.mock('@/lib/information-validator/web-search', () => ({ searchWeb: mock.search }));
// Prisma is replaced by in-memory fakes, so this test never opens a database.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    stage: { findFirst: mock.stageFind },
    contentChunk: { findMany: mock.chunks },
    teachingMessage: { findMany: mock.history, create: mock.create },
  },
}));
import { LESSON_STYLE_RULE } from '@/lib/teaching-session-engine/lesson-style';
import { POST } from './route';
import { CHECK_CONTINUE_INSTRUCTION, LESSON_ACTIONS, lessonActionInstruction, lessonActionLine } from '@/lib/teaching-session-engine/lesson-actions';

type StreamOptions = { system: string; messages: { role: string; content: string }[] };

const request = (body: unknown) => new Request('http://localhost:3000/api/teaching-session/message', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const base = { journeyId: 'j1', stageId: 's1', messageId: 'm1' };
const saved = () => mock.create.mock.calls.map(([arg]) => arg.data as { role: string; content: string; messageType: string });
const streamOptions = () => mock.stream.mock.calls[0][0] as StreamOptions;

/** Saved stage history as Prisma returns it, oldest first. */
const row = (n: number, role: 'user' | 'assistant', content: string) => ({
  id: `h${n}`, stageId: 's1', journeyId: 'j1', role, content, sources: null,
  messageType: role === 'assistant' && n === 0 ? 'lecture' : 'qa', createdAt: new Date(2026, 10, 19, 9, n),
});
const checkStarted = [
  row(0, 'assistant', 'Welcome. A RACI chart names who is Responsible, Accountable, Consulted and Informed.'),
  row(1, 'user', 'Check my understanding.'),
  row(2, 'assistant', 'Question 1: who signs off the work?'),
];

async function send(body: unknown) {
  const response = await POST(request(body));
  const text = response.body ? await response.text() : '';
  return { response, text };
}

describe('POST /api/teaching-session/message with lesson actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.config.mockResolvedValue({ type: 'openai', model: 'test', apiKey: 'k' });
    mock.search.mockResolvedValue([]);
    mock.stageFind.mockResolvedValue({ id: 's1', title: 'Roles and responsibilities' });
    mock.chunks.mockResolvedValue([{ id: 'c1', stageId: 's1', journeyId: 'j1', content: 'A RACI chart names who is responsible.', sourceDocument: 'raci.pdf', sourceSection: 'Basics', order: 1, wordCount: 7 }]);
    mock.history.mockResolvedValue([]);
    mock.create.mockResolvedValue({});
    mock.stream.mockImplementation(() => ({ textStream: (async function* () { yield 'Here is the answer [Document: raci.pdf].'; })() }));
  });

  it.each(LESSON_ACTIONS)('saves the visible line for %s, adds its instruction and saves the reply as qa', async (action) => {
    const { response, text } = await send({ ...base, message: 'ignored client text', action });
    expect(response.status).toBe(200);
    expect(text).toBe('Here is the answer [Document: raci.pdf].');
    expect(saved()).toEqual([
      expect.objectContaining({ id: 'm1', role: 'user', content: lessonActionLine(action), messageType: 'qa' }),
      expect.objectContaining({ role: 'assistant', content: 'Here is the answer [Document: raci.pdf].', messageType: 'qa' }),
    ]);
    expect(streamOptions().system).toContain(lessonActionInstruction(action));
    expect(streamOptions().messages.at(-1)).toEqual({ role: 'user', content: lessonActionLine(action) });
    expect(mock.search).toHaveBeenCalledWith('Roles and responsibilities', { maxResults: 5 });
  });

  it('names the role in the work line and instruction', async () => {
    await send({ ...base, message: 'x', action: 'work', role: ' Project Manager ' });
    expect(saved()[0].content).toBe('How does this apply at work, for a Project Manager role?');
    expect(streamOptions().system).toContain(lessonActionInstruction('work', 'Project Manager'));
  });

  it('ignores a role sent with any other action', async () => {
    await send({ ...base, message: 'x', action: 'example', role: 'Project Manager' });
    expect(saved()[0].content).toBe('Give me an example.');
    expect(streamOptions().system).not.toContain('Project Manager');
  });

  it('refuses an unknown action with 400 and saves nothing', async () => {
    const { response, text } = await send({ ...base, message: 'x', action: 'quiz' });
    expect(response.status).toBe(400);
    expect(JSON.parse(text)).toEqual({ error: 'Unknown lesson action.', code: 'VALIDATION_ERROR', retryable: false });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.stream).not.toHaveBeenCalled();
  });

  it('refuses an overlong role with 400', async () => {
    const { response } = await send({ ...base, message: 'x', action: 'work', role: 'r'.repeat(201) });
    expect(response.status).toBe(400);
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('keeps the no-action path as before: the typed message, its own search, no instruction, intent-based type', async () => {
    await send({ ...base, message: 'continue' });
    expect(saved()).toEqual([
      expect.objectContaining({ role: 'user', content: 'continue', messageType: 'qa' }),
      expect.objectContaining({ role: 'assistant', messageType: 'lecture' }),
    ]);
    expect(mock.search).toHaveBeenCalledWith('continue', { maxResults: 5 });
    expect(streamOptions().system).not.toContain('LESSON REQUEST');
  });

  it('treats a typed "Check my understanding." like the button: start instruction, saved line, qa reply', async () => {
    await send({ ...base, message: 'check my understanding' });
    expect(saved()).toEqual([
      expect.objectContaining({ role: 'user', content: 'Check my understanding.', messageType: 'qa' }),
      expect.objectContaining({ role: 'assistant', messageType: 'qa' }),
    ]);
    expect(streamOptions().system).toContain(lessonActionInstruction('check'));
    expect(streamOptions().system).not.toContain(CHECK_CONTINUE_INSTRUCTION);
  });

  it('takes the role from a typed work line', async () => {
    await send({ ...base, message: 'How does this apply at work, for a Nurse role?' });
    expect(saved()[0].content).toBe('How does this apply at work, for a Nurse role?');
    expect(streamOptions().system).toContain(lessonActionInstruction('work', 'Nurse'));
  });

  it('still answers 404 for a stage outside the journey', async () => {
    mock.stageFind.mockResolvedValue(null);
    const { response } = await send({ ...base, message: 'x', action: 'check' });
    expect(response.status).toBe(404);
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('keeps a check going: "ok" gets the continue instruction, the stage-title search and a qa reply', async () => {
    mock.history.mockResolvedValue(checkStarted);
    await send({ ...base, message: 'ok' });
    expect(saved()).toEqual([
      expect.objectContaining({ role: 'user', content: 'ok', messageType: 'qa' }),
      expect.objectContaining({ role: 'assistant', messageType: 'qa' }),
    ]);
    expect(streamOptions().system).toContain(CHECK_CONTINUE_INSTRUCTION);
    expect(mock.search).toHaveBeenCalledWith('Roles and responsibilities', { maxResults: 5 });
  });

  it('treats Next ("continue") during a check as an answer too', async () => {
    mock.history.mockResolvedValue(checkStarted);
    await send({ ...base, message: 'continue' });
    expect(saved()[1]).toEqual(expect.objectContaining({ role: 'assistant', messageType: 'qa' }));
    expect(streamOptions().system).toContain(CHECK_CONTINUE_INSTRUCTION);
  });

  it('stops continuing once the check has had 5 replies', async () => {
    const answers = [3, 5, 7, 9].flatMap((n) => [row(n, 'user', `Answer ${n}`), row(n + 1, 'assistant', `Reply ${n}`)]);
    mock.history.mockResolvedValue([...checkStarted, ...answers]);
    await send({ ...base, message: 'ok' });
    expect(saved()[1]).toEqual(expect.objectContaining({ role: 'assistant', messageType: 'lecture' }));
    expect(streamOptions().system).not.toContain('LESSON REQUEST');
    expect(mock.search).toHaveBeenCalledWith('ok', { maxResults: 5 });
  });

  it('lets a button during a check use its own instruction instead', async () => {
    mock.history.mockResolvedValue(checkStarted);
    await send({ ...base, message: 'x', action: 'simpler' });
    expect(streamOptions().system).toContain(lessonActionInstruction('simpler'));
    expect(streamOptions().system).not.toContain(CHECK_CONTINUE_INSTRUCTION);
  });
  it('asks for no em dashes and saves the reply without any, even when the AI writes them', async () => {
    mock.stream.mockImplementation(() => ({
      textStream: (async function* () {
        yield '1. **Trust** — teams that trust each other\n\nStakeholders can affect — or be affected by — your project.';
      })(),
    }));
    await send({ ...base, message: 'Tell me about trust' });
    expect(streamOptions().system).toContain(LESSON_STYLE_RULE);
    expect(streamOptions().system).not.toContain('—');
    const reply = saved().find((row) => row.role === 'assistant');
    expect(reply?.content).toBe('1. **Trust**: teams that trust each other\n\nStakeholders can affect (or be affected by) your project.');
  });
});
