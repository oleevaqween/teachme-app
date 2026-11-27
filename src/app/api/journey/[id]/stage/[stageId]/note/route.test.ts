import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  stage: vi.fn(),
  findNote: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));
// A fake client: no database is opened.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    stage: { findFirst: mock.stage },
    stageNote: { findUnique: mock.findNote, upsert: mock.upsert, deleteMany: mock.deleteMany },
  },
}));
import { GET, PUT } from './route';
import { MAX_NOTE_LENGTH, NOTES_UNAVAILABLE_MESSAGE } from '@/lib/teaching-session-engine/stage-note';

const URL = 'http://localhost:3000/api/journey/j1/stage/s1/note';
const params = { params: Promise.resolve({ id: 'j1', stageId: 's1' }) };
const put = (body: unknown) =>
  PUT(new Request(URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), params);
const missingTable = () => Object.assign(new Error('SQLITE_ERROR: no such table: main.StageNote'), { name: 'DriverAdapterError' });
const when = new Date('2026-11-27T10:00:00.000Z');

describe('GET /api/journey/[id]/stage/[stageId]/note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.stage.mockResolvedValue({ id: 's1' });
  });

  it('returns the saved note', async () => {
    mock.findNote.mockResolvedValue({ content: 'Scope first.', updatedAt: when });
    const response = await GET(new Request(URL), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: 'Scope first.', updatedAt: when.toISOString() });
    expect(mock.stage).toHaveBeenCalledWith({ where: { id: 's1', journeyId: 'j1' }, select: { id: true } });
    expect(mock.findNote).toHaveBeenCalledWith({ where: { stageId: 's1' }, select: { content: true, updatedAt: true } });
  });

  it('returns an empty note when none is saved', async () => {
    mock.findNote.mockResolvedValue(null);
    expect(await (await GET(new Request(URL), params)).json()).toEqual({ content: '', updatedAt: null });
  });

  it('answers 404 for a stage outside the journey without reading notes', async () => {
    mock.stage.mockResolvedValue(null);
    expect((await GET(new Request(URL), params)).status).toBe(404);
    expect(mock.findNote).not.toHaveBeenCalled();
  });

  it('answers 503 with the db:setup message when the notes table is missing', async () => {
    mock.findNote.mockRejectedValue(missingTable());
    const response = await GET(new Request(URL), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: NOTES_UNAVAILABLE_MESSAGE, code: 'NOTES_UNAVAILABLE' });
  });
});

describe('PUT /api/journey/[id]/stage/[stageId]/note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.stage.mockResolvedValue({ id: 's1' });
    mock.upsert.mockResolvedValue({ content: 'Scope first.', updatedAt: when });
    mock.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('saves the note for the stage, exactly as typed', async () => {
    const response = await put({ content: 'Scope first.\n' });
    expect(response.status).toBe(200);
    expect(mock.upsert).toHaveBeenCalledWith({
      where: { stageId: 's1' },
      create: { stageId: 's1', journeyId: 'j1', content: 'Scope first.\n' },
      update: { content: 'Scope first.\n' },
      select: { content: true, updatedAt: true },
    });
    expect(await response.json()).toEqual({ content: 'Scope first.', updatedAt: when.toISOString() });
  });

  it('removes the note when only spaces or nothing are left', async () => {
    const response = await put({ content: '  \n ' });
    expect(response.status).toBe(200);
    expect(mock.deleteMany).toHaveBeenCalledWith({ where: { stageId: 's1' } });
    expect(mock.upsert).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ content: '', updatedAt: null });
  });

  it('refuses a note over the limit without writing', async () => {
    const response = await put({ content: 'a'.repeat(MAX_NOTE_LENGTH + 1) });
    expect(response.status).toBe(400);
    expect(mock.upsert).not.toHaveBeenCalled();
    expect(mock.stage).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON or has no string content', async () => {
    expect((await put('not json')).status).toBe(400);
    expect((await put({ text: 'x' })).status).toBe(400);
    expect(mock.upsert).not.toHaveBeenCalled();
  });

  it('answers 404 for a stage outside the journey without writing', async () => {
    mock.stage.mockResolvedValue(null);
    expect((await put({ content: 'x' })).status).toBe(404);
    expect(mock.upsert).not.toHaveBeenCalled();
    expect(mock.deleteMany).not.toHaveBeenCalled();
  });

  it('answers 503 with the db:setup message when the notes table is missing', async () => {
    mock.upsert.mockRejectedValue(missingTable());
    const response = await put({ content: 'x' });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('NOTES_UNAVAILABLE');
  });
});
