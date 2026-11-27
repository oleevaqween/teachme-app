import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  stage: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  createManyAndReturn: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  chunks: vi.fn(),
  provider: vi.fn(),
  generate: vi.fn(),
}));
// A fake client: no database is opened.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    stage: { findFirst: mock.stage },
    contentChunk: { findMany: mock.chunks },
    flashcard: {
      findMany: mock.findMany,
      findFirst: mock.findFirst,
      count: mock.count,
      create: mock.create,
      createManyAndReturn: mock.createManyAndReturn,
      update: mock.update,
      delete: mock.remove,
    },
  },
}));
vi.mock('@/lib/llm/config', () => ({ getActiveProviderConfig: mock.provider }));
vi.mock('@/lib/teaching-session-engine/flashcard-generator', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateFlashcardText: mock.generate,
}));
import * as list from './route';
import * as one from './[cardId]/route';
import * as generate from './generate/route';
import { MAX_CARDS_PER_STAGE } from '@/lib/teaching-session-engine/flashcards';

const base = 'http://localhost:3000/api/journey/j1/stage/s1/flashcards';
const stageParams = { params: Promise.resolve({ id: 'j1', stageId: 's1' }) };
const cardParams = { params: Promise.resolve({ id: 'j1', stageId: 's1', cardId: 'c1' }) };
const json = (method: string, body: unknown) =>
  new Request(base, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const due = new Date('2026-11-27T10:00:00.000Z');
const stored = { id: 'c1', front: 'What is a WBS?', back: 'A breakdown of scope.', source: 'own', box: 0, dueAt: due };
const missingTable = () => new Error('SQLITE_ERROR: no such table: main.Flashcard');

beforeEach(() => {
  vi.clearAllMocks();
  mock.stage.mockResolvedValue({ id: 's1', title: 'Scope' });
  mock.findMany.mockResolvedValue([stored]);
  mock.findFirst.mockResolvedValue({ id: 'c1', box: 2 });
  mock.count.mockResolvedValue(1);
  mock.create.mockResolvedValue(stored);
  mock.update.mockImplementation(async ({ data }: { data: object }) => ({ ...stored, ...data }));
  mock.remove.mockResolvedValue(stored);
  mock.chunks.mockResolvedValue([{ content: 'A WBS breaks down the total scope.', sourceSection: 'Scope' }]);
  mock.provider.mockResolvedValue({ type: 'ollama-local', model: 'fake' });
  mock.generate.mockResolvedValue('Q: What does a WBS break down?\nA: The total scope.\n\nQ: What is a WBS?\nA: Repeat.');
  mock.createManyAndReturn.mockImplementation(async ({ data }: { data: { front: string; back: string; source: string }[] }) =>
    data.map((d, i) => ({ id: `n${i}`, box: 0, dueAt: due, ...d }))
  );
});

describe('flashcards list and add', () => {
  it('lists the stage cards with ISO due times', async () => {
    const res = await list.GET(new Request(base), stageParams);
    expect(await res.json()).toEqual({ cards: [{ ...stored, dueAt: due.toISOString() }] });
    expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { stageId: 's1' }, orderBy: { createdAt: 'asc' } }));
  });

  it('adds an own card after checking the stage', async () => {
    const res = await list.POST(json('POST', { front: ' What is a WBS? ', back: 'A breakdown of scope.' }), stageParams);
    expect(res.status).toBe(200);
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ data: { stageId: 's1', journeyId: 'j1', front: 'What is a WBS?', back: 'A breakdown of scope.', source: 'own' } }));
  });

  it('refuses bad cards, unknown stages and a full stage without writing', async () => {
    expect((await list.POST(json('POST', { front: '', back: 'x' }), stageParams)).status).toBe(400);
    mock.stage.mockResolvedValueOnce(null);
    expect((await list.POST(json('POST', { front: 'q', back: 'a' }), stageParams)).status).toBe(404);
    mock.count.mockResolvedValueOnce(MAX_CARDS_PER_STAGE);
    expect((await list.POST(json('POST', { front: 'q', back: 'a' }), stageParams)).status).toBe(409);
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('answers 503 FLASHCARDS_UNAVAILABLE on a database without the table', async () => {
    mock.findMany.mockRejectedValueOnce(missingTable());
    const res = await list.GET(new Request(base), stageParams);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('FLASHCARDS_UNAVAILABLE');
  });
});

describe('one card', () => {
  it('reviews Got it: next box and its interval, and records the review time', async () => {
    const res = await one.POST(json('POST', { result: 'good' }), cardParams);
    expect(res.status).toBe(200);
    const data = mock.update.mock.calls[0][0].data;
    expect(data.box).toBe(3);
    expect(Math.round((data.dueAt.getTime() - data.lastReviewedAt.getTime()) / 86_400_000)).toBe(7);
    expect(mock.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', stageId: 's1', journeyId: 'j1' }, select: { id: true, box: true } });
  });

  it('reviews Again: back to box 0, due now', async () => {
    await one.POST(json('POST', { result: 'again' }), cardParams);
    const data = mock.update.mock.calls[0][0].data;
    expect(data.box).toBe(0);
    expect(data.dueAt.getTime()).toBe(data.lastReviewedAt.getTime());
  });

  it('edits and deletes only a card of this stage', async () => {
    expect((await one.PATCH(json('PATCH', { front: 'New?', back: 'Yes.' }), cardParams)).status).toBe(200);
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: { front: 'New?', back: 'Yes.' } }));
    expect((await one.DELETE(new Request(base, { method: 'DELETE' }), cardParams)).status).toBe(200);
    expect(mock.remove).toHaveBeenCalledWith({ where: { id: 'c1' } });
    mock.findFirst.mockResolvedValue(null);
    vi.clearAllMocks();
    mock.findFirst.mockResolvedValue(null);
    expect((await one.DELETE(new Request(base, { method: 'DELETE' }), cardParams)).status).toBe(404);
    expect((await one.POST(json('POST', { result: 'good' }), cardParams)).status).toBe(404);
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('refuses a review result other than again or good', async () => {
    expect((await one.POST(json('POST', { result: 'easy' }), cardParams)).status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });
});

describe('generate', () => {
  it('keeps the prompt short for a local model: smaller material, at most 20 recent questions', async () => {
    mock.provider.mockResolvedValue({ type: 'ollama-local', model: 'fake' });
    mock.chunks.mockResolvedValue([{ content: 'x'.repeat(20_000), sourceSection: 'Big' }]);
    mock.findMany.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ front: `Old question ${i}?` })));
    await generate.POST(new Request(base, { method: 'POST' }), stageParams);
    const prompt: string = mock.generate.mock.calls[0][1];
    expect(prompt.length).toBeLessThan(7_000);
    expect(prompt).toContain('Old question 29?');
    expect(prompt).not.toContain('Old question 9?');
    expect(prompt.indexOf('Material:')).toBeLessThan(prompt.indexOf('Q: the question'));
  });

  it('saves the new AI cards one by one, skipping questions the stage already has', async () => {
    mock.create.mockImplementation(async ({ data }: { data: { front: string; back: string } }) => ({ ...stored, ...data, id: 'n0' }));
    const res = await generate.POST(new Request(base, { method: 'POST' }), stageParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cards.map((c: { front: string }) => c.front)).toEqual(['What does a WBS break down?']);
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { stageId: 's1', journeyId: 'j1', front: 'What does a WBS break down?', back: 'The total scope.', source: 'ai' },
    }));
    expect(mock.createManyAndReturn).not.toHaveBeenCalled();
    expect(mock.generate.mock.calls[0][1]).toContain('A WBS breaks down the total scope.');
    expect(mock.generate.mock.calls[0][1]).toContain('- What is a WBS?');
  });

  it('answers clearly when no provider is set, the AI fails, or its reply has no cards', async () => {
    mock.provider.mockResolvedValueOnce(null);
    expect((await generate.POST(new Request(base, { method: 'POST' }), stageParams)).status).toBe(400);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    mock.generate.mockRejectedValueOnce(new Error('provider down'));
    expect((await generate.POST(new Request(base, { method: 'POST' }), stageParams)).status).toBe(502);
    quiet.mockRestore();
    mock.generate.mockResolvedValueOnce('Sorry, I cannot help with that.');
    expect((await generate.POST(new Request(base, { method: 'POST' }), stageParams)).status).toBe(422);
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('does not call the AI for a full stage or an unknown stage', async () => {
    mock.findMany.mockResolvedValueOnce(Array.from({ length: MAX_CARDS_PER_STAGE }, (_, i) => ({ front: `q${i}` })));
    expect((await generate.POST(new Request(base, { method: 'POST' }), stageParams)).status).toBe(409);
    mock.stage.mockResolvedValueOnce(null);
    expect((await generate.POST(new Request(base, { method: 'POST' }), stageParams)).status).toBe(404);
    expect(mock.generate).not.toHaveBeenCalled();
  });
});
