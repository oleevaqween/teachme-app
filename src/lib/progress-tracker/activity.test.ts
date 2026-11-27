import { describe, expect, it } from 'vitest';
import { lastStudiedLabel, parseActivity, resumeTarget, stageActivity, type StageActivity } from './activity';
import type { StageProgress } from './index';

const stages = [
  { id: 's1', order: 1 },
  { id: 's2', order: 2 },
  { id: 's3', order: 3 },
];
const progress = (statuses: StageProgress['status'][]) =>
  statuses.map((status, i) => ({ stageId: `s${i + 1}`, status }));
const studied = (times: (string | null)[]): StageActivity[] =>
  times.map((lastStudiedAt, i) => ({ stageId: `s${i + 1}`, lastStudiedAt }));

describe('stage activity', () => {
  it('lists every stage in order with its latest message time or null', () => {
    const at = new Date('2026-11-18T10:00:00.000Z');
    expect(stageActivity(['s1', 's2'], [{ stageId: 's2', at }, { stageId: 'other', at }])).toEqual([
      { stageId: 's1', lastStudiedAt: null, studySeconds: 0 },
      { stageId: 's2', lastStudiedAt: '2026-11-18T10:00:00.000Z', studySeconds: 0 },
    ]);
    expect(stageActivity(['s1'], [{ stageId: 's1', at: null }])).toEqual([{ stageId: 's1', lastStudiedAt: null, studySeconds: 0 }]);
  });

  it('counts reading time as studying: last studied is the later of message and study time', () => {
    const message = new Date('2026-11-18T10:00:00.000Z');
    const later = new Date('2026-11-20T10:00:00.000Z');
    const earlier = new Date('2026-11-01T10:00:00.000Z');
    expect(
      stageActivity(
        ['a', 'b', 'c', 'd'],
        [{ stageId: 'a', at: message }, { stageId: 'b', at: message }],
        [
          { stageId: 'a', seconds: 60, lastStudiedAt: later },
          { stageId: 'b', seconds: 60, lastStudiedAt: earlier },
          { stageId: 'c', seconds: 60, lastStudiedAt: later },
          { stageId: 'd', seconds: 5, lastStudiedAt: null },
        ]
      ).map((a) => a.lastStudiedAt)
    ).toEqual([later.toISOString(), message.toISOString(), later.toISOString(), null]);
  });

  it('adds each stage its study seconds', () => {
    expect(stageActivity(['s1', 's2'], [], [{ stageId: 's2', seconds: 1500 }, { stageId: 'other', seconds: 9 }])).toEqual([
      { stageId: 's1', lastStudiedAt: null, studySeconds: 0 },
      { stageId: 's2', lastStudiedAt: null, studySeconds: 1500 },
    ]);
  });

  it('reads well-formed endpoint JSON and rejects anything else', () => {
    const good = { stages: [{ stageId: 's1', lastStudiedAt: '2026-11-18T10:00:00.000Z', studySeconds: 90 }, { stageId: 's2', lastStudiedAt: null, studySeconds: 0 }] };
    expect(parseActivity(good)).toEqual(good.stages);
    // Older answers without study time read as 0 seconds.
    expect(parseActivity({ stages: [{ stageId: 's1', lastStudiedAt: null }] })).toEqual([{ stageId: 's1', lastStudiedAt: null, studySeconds: 0 }]);
    expect(parseActivity({ stages: [{ stageId: 's1', lastStudiedAt: null, studySeconds: -1 }] })).toBeNull();
    expect(parseActivity({ stages: [{ stageId: 's1', lastStudiedAt: null, studySeconds: '90' }] })).toBeNull();
    expect(parseActivity(null)).toBeNull();
    expect(parseActivity({ error: 'Journey not found.' })).toBeNull();
    expect(parseActivity({ stages: [{ stageId: 1, lastStudiedAt: null }] })).toBeNull();
    expect(parseActivity({ stages: [{ stageId: 's1', lastStudiedAt: 'not a date' }] })).toBeNull();
  });
});

describe('resume target', () => {
  it('picks the most recently studied stage that is not completed', () => {
    const target = resumeTarget(
      stages,
      progress(['completed', 'in_progress', 'unlocked']),
      studied(['2026-11-19T09:00:00.000Z', '2026-11-17T09:00:00.000Z', '2026-11-18T09:00:00.000Z'])
    );
    expect(target).toBe('s3');
  });

  it('falls back to the first unlocked stage that is not completed when nothing open was studied', () => {
    expect(resumeTarget(stages, progress(['completed', 'unlocked', 'locked']), studied(['2026-11-19T09:00:00.000Z', null, null]))).toBe('s2');
    expect(resumeTarget(stages, progress(['unlocked', 'locked', 'locked']), [])).toBe('s1');
  });

  it('never targets a locked stage, even one with messages', () => {
    expect(resumeTarget(stages, progress(['unlocked', 'locked', 'locked']), studied([null, '2026-11-19T09:00:00.000Z', null]))).toBe('s1');
  });

  it('has no target when the journey is complete', () => {
    expect(resumeTarget(stages, progress(['completed', 'completed', 'completed']), studied(['2026-11-19T09:00:00.000Z', null, null]))).toBeNull();
  });
});

describe('last studied wording', () => {
  const now = new Date(2026, 10, 19, 9, 30);

  it('counts local calendar days', () => {
    expect(lastStudiedLabel(new Date(2026, 10, 19, 0, 5), now)).toBe('Last studied today');
    expect(lastStudiedLabel(new Date(2026, 10, 18, 23, 59), now)).toBe('Last studied yesterday');
    expect(lastStudiedLabel(new Date(2026, 10, 16, 12, 0), now)).toBe('Last studied 3 days ago');
    expect(lastStudiedLabel(new Date(2026, 9, 20, 12, 0), now)).toBe('Last studied 30 days ago');
  });

  it('treats a time in the future as today', () => {
    expect(lastStudiedLabel(new Date(2026, 10, 20, 8, 0), now)).toBe('Last studied today');
  });
});
