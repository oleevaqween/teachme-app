import { describe, it, expect } from 'vitest';
import { computeStageStatuses } from './index';
import type { Stage } from '@/lib/journey-map-generator';

function makeStage(overrides: Partial<Stage> & { id: string; order: number }): Stage {
  return {
    journeyId: 'journey-1',
    title: `Stage ${overrides.order}`,
    summary: 'A test stage',
    theme: 'test',
    topicsCovered: [],
    ...overrides,
  };
}

describe('computeStageStatuses', () => {
  it('returns empty array for empty stages', () => {
    const result = computeStageStatuses([], []);
    expect(result).toEqual([]);
  });

  it('marks the first stage as unlocked when no completions', () => {
    const stages = [makeStage({ id: 's1', order: 1 })];
    const result = computeStageStatuses(stages, []);
    expect(result).toEqual([
      { stageId: 's1', journeyId: 'journey-1', status: 'unlocked' },
    ]);
  });

  it('marks the first stage as completed when it appears in completions', () => {
    const stages = [makeStage({ id: 's1', order: 1 })];
    const completedAt = new Date('2024-01-01');
    const result = computeStageStatuses(stages, [{ stageId: 's1', completedAt }]);
    expect(result).toEqual([
      { stageId: 's1', journeyId: 'journey-1', status: 'completed', completedAt },
    ]);
  });

  it('unlocks stage 2 only if stage 1 is completed', () => {
    const stages = [
      makeStage({ id: 's1', order: 1 }),
      makeStage({ id: 's2', order: 2 }),
    ];
    const completedAt = new Date('2024-01-01');

    // Stage 1 completed → stage 2 unlocked
    const result = computeStageStatuses(stages, [{ stageId: 's1', completedAt }]);
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('unlocked');
  });

  it('locks stage 2 if stage 1 is not completed', () => {
    const stages = [
      makeStage({ id: 's1', order: 1 }),
      makeStage({ id: 's2', order: 2 }),
    ];
    const result = computeStageStatuses(stages, []);
    expect(result[0].status).toBe('unlocked');
    expect(result[1].status).toBe('locked');
  });

  it('does not unlock stages after first incomplete stage', () => {
    const stages = [
      makeStage({ id: 's1', order: 1 }),
      makeStage({ id: 's2', order: 2 }),
      makeStage({ id: 's3', order: 3 }),
      makeStage({ id: 's4', order: 4 }),
    ];
    const completedAt = new Date('2024-01-01');

    // Only stage 1 completed → stage 2 unlocked, stages 3 and 4 locked
    const result = computeStageStatuses(stages, [{ stageId: 's1', completedAt }]);
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('unlocked');
    expect(result[2].status).toBe('locked');
    expect(result[3].status).toBe('locked');
  });

  it('handles all stages completed', () => {
    const stages = [
      makeStage({ id: 's1', order: 1 }),
      makeStage({ id: 's2', order: 2 }),
      makeStage({ id: 's3', order: 3 }),
    ];
    const completedAt = new Date('2024-01-01');
    const completions = stages.map((s) => ({ stageId: s.id, completedAt }));

    const result = computeStageStatuses(stages, completions);
    expect(result.every((r) => r.status === 'completed')).toBe(true);
  });

  it('handles stages provided out of order', () => {
    const stages = [
      makeStage({ id: 's3', order: 3 }),
      makeStage({ id: 's1', order: 1 }),
      makeStage({ id: 's2', order: 2 }),
    ];
    const completedAt = new Date('2024-01-01');
    const completions = [{ stageId: 's1', completedAt }];

    const result = computeStageStatuses(stages, completions);
    // Result should be sorted by order
    expect(result[0]).toMatchObject({ stageId: 's1', status: 'completed' });
    expect(result[1]).toMatchObject({ stageId: 's2', status: 'unlocked' });
    expect(result[2]).toMatchObject({ stageId: 's3', status: 'locked' });
  });

  it('ignores completions for non-existent stages', () => {
    const stages = [makeStage({ id: 's1', order: 1 })];
    const completedAt = new Date('2024-01-01');
    const completions = [
      { stageId: 's1', completedAt },
      { stageId: 'non-existent', completedAt },
    ];
    const result = computeStageStatuses(stages, completions);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('completed');
  });

  it('preserves completedAt date on completed stages', () => {
    const stages = [
      makeStage({ id: 's1', order: 1 }),
      makeStage({ id: 's2', order: 2 }),
    ];
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-01-05');
    const completions = [
      { stageId: 's1', completedAt: date1 },
      { stageId: 's2', completedAt: date2 },
    ];

    const result = computeStageStatuses(stages, completions);
    expect(result[0].completedAt).toEqual(date1);
    expect(result[1].completedAt).toEqual(date2);
  });
});
