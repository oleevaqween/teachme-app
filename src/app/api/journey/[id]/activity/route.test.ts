import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ journey: vi.fn(), stages: vi.fn(), groupBy: vi.fn(), study: vi.fn(), checks: vi.fn() }));
// Only read methods exist on this fake, so any write would throw; no database is opened.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    journey: { findUnique: mock.journey },
    stage: { findMany: mock.stages },
    teachingMessage: { groupBy: mock.groupBy },
    stageStudyTime: { findMany: mock.study },
    checkResult: { findMany: mock.checks },
  },
}));
import { GET } from './route';

const call = (id: string) =>
  GET(new Request(`http://localhost:3000/api/journey/${id}/activity`), { params: Promise.resolve({ id }) });

describe('GET /api/journey/[id]/activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.journey.mockResolvedValue({ id: 'j1' });
    mock.stages.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    mock.groupBy.mockResolvedValue([
      { stageId: 's2', _max: { createdAt: new Date('2026-11-18T10:00:00.000Z') } },
      { stageId: 's1', _max: { createdAt: new Date('2026-11-17T08:00:00.000Z') } },
    ]);
    mock.study.mockResolvedValue([{ stageId: 's2', seconds: 1500 }]);
    mock.checks.mockResolvedValue([{ stageId: 's1', correct: 3, total: 4, createdAt: new Date('2026-11-17T09:00:00.000Z') }]);
  });

  it('returns each stage with the time of its latest message, or null', async () => {
    const response = await call('j1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stages: [
        { stageId: 's1', lastStudiedAt: '2026-11-17T08:00:00.000Z', studySeconds: 0, lastCheck: { correct: 3, total: 4 } },
        { stageId: 's2', lastStudiedAt: '2026-11-18T10:00:00.000Z', studySeconds: 1500, lastCheck: null },
        { stageId: 's3', lastStudiedAt: null, studySeconds: 0, lastCheck: null },
      ],
    });
    expect(mock.stages).toHaveBeenCalledWith({ where: { journeyId: 'j1' }, select: { id: true }, orderBy: { order: 'asc' } });
    expect(mock.groupBy).toHaveBeenCalledWith({ by: ['stageId'], where: { journeyId: 'j1' }, _max: { createdAt: true } });
  });

  it('reads study time for the journey', async () => {
    await call('j1');
    expect(mock.study).toHaveBeenCalledWith({ where: { journeyId: 'j1' }, select: { stageId: true, seconds: true, lastStudiedAt: true } });
  });

  it('uses the latest study time as last studied when it is later than the latest message', async () => {
    mock.study.mockResolvedValue([
      { stageId: 's1', seconds: 120, lastStudiedAt: new Date('2026-11-20T09:00:00.000Z') },
      { stageId: 's2', seconds: 60, lastStudiedAt: new Date('2026-11-01T09:00:00.000Z') },
    ]);
    const body = await (await call('j1')).json();
    expect(body.stages.map((s: { lastStudiedAt: string | null }) => s.lastStudiedAt)).toEqual([
      '2026-11-20T09:00:00.000Z',
      '2026-11-18T10:00:00.000Z',
      null,
    ]);
  });

  it('reads check scores for the journey, read-only', async () => {
    await call('j1');
    expect(mock.checks).toHaveBeenCalledWith({ where: { journeyId: 'j1' }, select: { stageId: true, correct: true, total: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  });

  it('shows no checks, keeping everything else, when the database has no CheckResult table', async () => {
    mock.checks.mockRejectedValue(new Error('SQLITE_ERROR: no such table: main.CheckResult'));
    const response = await call('j1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stages[1]).toEqual({ stageId: 's2', lastStudiedAt: '2026-11-18T10:00:00.000Z', studySeconds: 1500, lastCheck: null });
    expect(body.stages[0].lastCheck).toBeNull();
  });

  it('reports 0 seconds when the database has no study time table yet', async () => {
    mock.study.mockRejectedValue(new Error('SQLITE_ERROR: no such table: main.StageStudyTime'));
    const response = await call('j1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stages.map((s: { studySeconds: number }) => s.studySeconds)).toEqual([0, 0, 0]);
  });

  it('keeps the dates and reports 0 seconds on any other study time error', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    mock.study.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));
    const response = await call('j1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stages[0]).toEqual({ stageId: 's1', lastStudiedAt: '2026-11-17T08:00:00.000Z', studySeconds: 0, lastCheck: { correct: 3, total: 4 } });
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('answers 404 for an unknown journey without reading messages', async () => {
    mock.journey.mockResolvedValue(null);
    const response = await call('missing');
    expect(response.status).toBe(404);
    expect(mock.groupBy).not.toHaveBeenCalled();
  });
});
