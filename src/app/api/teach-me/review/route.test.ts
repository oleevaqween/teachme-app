import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ journeys: vi.fn(), groupBy: vi.fn(), study: vi.fn(), checks: vi.fn(), due: vi.fn() }));
// Only read methods exist on this fake, so any write would throw; no database is opened.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    journey: { findMany: mock.journeys },
    teachingMessage: { groupBy: mock.groupBy },
    stageStudyTime: { findMany: mock.study },
    checkResult: { findMany: mock.checks },
    flashcard: { groupBy: mock.due },
  },
}));
import { GET } from './route';

const old = new Date(Date.now() - 30 * 86_400_000);

describe('GET /api/teach-me/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.journeys.mockResolvedValue([
      {
        id: 'j1',
        topic: 'PMBOK',
        stages: [
          { id: 's1', order: 1, title: 'Base camp' },
          { id: 's2', order: 2, title: 'Compass' },
          { id: 's3', order: 3, title: 'Crew' },
          { id: 's4', order: 4, title: 'Locked' },
        ],
        progress: [
          { stageId: 's1', status: 'completed', completedAt: old },
          { stageId: 's2', status: 'completed', completedAt: new Date() },
          { stageId: 's3', status: 'in_progress', completedAt: null },
          { stageId: 's4', status: 'locked', completedAt: null },
        ],
      },
    ]);
    mock.groupBy.mockResolvedValue([{ stageId: 's1', _max: { createdAt: old } }]);
    mock.study.mockResolvedValue([]);
    mock.checks.mockResolvedValue([{ stageId: 's2', correct: 1, total: 4, createdAt: new Date() }]);
    mock.due.mockResolvedValue([
      { stageId: 's3', _count: { _all: 2 } },
      { stageId: 's4', _count: { _all: 9 } },
    ]);
  });

  it('lists stages due for review across journeys, most urgent first, skipping locked ones', async () => {
    const body = await (await GET()).json();
    expect(body.total).toBe(3);
    expect(body.items.map((i: { stageId: string; reason: { kind: string } }) => [i.stageId, i.reason.kind])).toEqual([
      ['s3', 'cards'],
      ['s2', 'check'],
      ['s1', 'stale'],
    ]);
    expect(body.items[0]).toMatchObject({ journeyId: 'j1', journeyTopic: 'PMBOK', stageOrder: 3, stageTitle: 'Crew' });
  });

  it('reads only interactive journeys, all of them in one go', async () => {
    await GET();
    expect(mock.journeys.mock.calls[0][0].where).toEqual({ isInteractive: true });
    expect(mock.groupBy.mock.calls[0][0].where).toEqual({ journeyId: { in: ['j1'] } });
  });

  it('still answers when the newer tables are missing (database not yet updated)', async () => {
    mock.study.mockRejectedValue(new Error('SQLITE_ERROR: no such table: main.StageStudyTime'));
    mock.checks.mockRejectedValue(new Error('SQLITE_ERROR: no such table: main.CheckResult'));
    mock.due.mockRejectedValue(new Error('SQLITE_ERROR: no such table: main.Flashcard'));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { stageId: string }) => i.stageId)).toEqual(['s1']);
  });

  it('answers an empty list when there are no journeys', async () => {
    mock.journeys.mockResolvedValue([]);
    expect(await (await GET()).json()).toEqual({ items: [], total: 0 });
    expect(mock.groupBy).not.toHaveBeenCalled();
  });
});
