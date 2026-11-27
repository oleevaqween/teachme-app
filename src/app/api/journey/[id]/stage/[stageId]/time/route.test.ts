import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ stage: vi.fn(), upsert: vi.fn() }));
// A fake client: no database is opened.
vi.mock('@/lib/db/client', () => ({
  prisma: { stage: { findFirst: mock.stage }, stageStudyTime: { upsert: mock.upsert } },
}));
import { POST } from './route';
import { MAX_INCREMENT_SECONDS } from '@/lib/progress-tracker/study-time';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost:3000/api/journey/j1/stage/s1/time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'j1', stageId: 's1' }) }
  );

describe('POST /api/journey/[id]/stage/[stageId]/time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.stage.mockResolvedValue({ id: 's1' });
    mock.upsert.mockResolvedValue({ seconds: 660 });
  });

  it('adds the seconds to the stage total and marks it studied now', async () => {
    const response = await post({ seconds: 60 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ seconds: 660 });
    expect(mock.stage).toHaveBeenCalledWith({ where: { id: 's1', journeyId: 'j1' }, select: { id: true } });
    const args = mock.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ stageId: 's1' });
    expect(args.create).toMatchObject({ stageId: 's1', journeyId: 'j1', seconds: 60 });
    expect(args.update).toMatchObject({ seconds: { increment: 60 } });
    expect(args.create.lastStudiedAt).toBeInstanceOf(Date);
    expect(args.update.lastStudiedAt).toBeInstanceOf(Date);
    expect(args.select).toEqual({ seconds: true });
  });

  it('a brief peek adds its seconds but does not mark the stage studied', async () => {
    await post({ seconds: 3 });
    const args = mock.upsert.mock.calls[0][0];
    expect(args.create).toEqual({ stageId: 's1', journeyId: 'j1', seconds: 3 });
    expect(args.update).toEqual({ seconds: { increment: 3 } });
  });

  it('refuses bad amounts and bodies without touching the database', async () => {
    for (const body of [{ seconds: 0 }, { seconds: MAX_INCREMENT_SECONDS + 1 }, { seconds: 2.5 }, 'not json']) {
      expect((await post(body)).status).toBe(400);
    }
    expect(mock.stage).not.toHaveBeenCalled();
    expect(mock.upsert).not.toHaveBeenCalled();
  });

  it('answers 404 for a stage outside the journey without writing', async () => {
    mock.stage.mockResolvedValue(null);
    expect((await post({ seconds: 60 })).status).toBe(404);
    expect(mock.upsert).not.toHaveBeenCalled();
  });

  it('answers 503 STUDY_TIME_UNAVAILABLE when the table is missing', async () => {
    mock.upsert.mockRejectedValue(new Error('SQLITE_ERROR: no such table: main.StageStudyTime'));
    const response = await post({ seconds: 60 });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('STUDY_TIME_UNAVAILABLE');
  });
});
