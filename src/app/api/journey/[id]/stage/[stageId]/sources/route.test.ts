import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ stage: vi.fn(), chunks: vi.fn() }));
// Only read methods exist on this fake, so any write would throw; no database is opened.
vi.mock('@/lib/db/client', () => ({
  prisma: { stage: { findFirst: mock.stage }, contentChunk: { findMany: mock.chunks } },
}));
import { GET } from './route';

const call = () =>
  GET(new Request('http://localhost:3000/api/journey/j1/stage/s1/sources'), {
    params: Promise.resolve({ id: 'j1', stageId: 's1' }),
  });

describe('GET /api/journey/[id]/stage/[stageId]/sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.stage.mockResolvedValue({ id: 's1' });
    mock.chunks.mockResolvedValue([
      { sourceDocument: 'plan.pdf', sourceSection: 'Scope' },
      { sourceDocument: 'plan.pdf', sourceSection: 'Risks' },
    ]);
  });

  it('returns the stage sources built from its chunks', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ documents: [{ name: 'plan.pdf', sections: ['Scope', 'Risks'] }], web: [] });
    expect(mock.stage).toHaveBeenCalledWith({ where: { id: 's1', journeyId: 'j1' }, select: { id: true } });
    expect(mock.chunks).toHaveBeenCalledWith({
      where: { stageId: 's1' },
      select: { sourceDocument: true, sourceSection: true },
      orderBy: { order: 'asc' },
    });
  });

  it('answers 404 for a stage outside the journey without reading chunks', async () => {
    mock.stage.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mock.chunks).not.toHaveBeenCalled();
  });
});
