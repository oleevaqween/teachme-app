import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ journey: vi.fn(), stages: vi.fn(), groupBy: vi.fn() }));
// Only read methods exist on this fake, so any write would throw; no database is opened.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    journey: { findUnique: mock.journey },
    stage: { findMany: mock.stages },
    teachingMessage: { groupBy: mock.groupBy },
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
  });

  it('returns each stage with the time of its latest message, or null', async () => {
    const response = await call('j1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stages: [
        { stageId: 's1', lastStudiedAt: '2026-11-17T08:00:00.000Z' },
        { stageId: 's2', lastStudiedAt: '2026-11-18T10:00:00.000Z' },
        { stageId: 's3', lastStudiedAt: null },
      ],
    });
    expect(mock.stages).toHaveBeenCalledWith({ where: { journeyId: 'j1' }, select: { id: true }, orderBy: { order: 'asc' } });
    expect(mock.groupBy).toHaveBeenCalledWith({ by: ['stageId'], where: { journeyId: 'j1' }, _max: { createdAt: true } });
  });

  it('answers 404 for an unknown journey without reading messages', async () => {
    mock.journey.mockResolvedValue(null);
    const response = await call('missing');
    expect(response.status).toBe(404);
    expect(mock.groupBy).not.toHaveBeenCalled();
  });
});
