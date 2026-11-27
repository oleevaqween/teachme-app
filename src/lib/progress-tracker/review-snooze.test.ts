import { describe, expect, it } from 'vitest';
import { SNOOZE_STORAGE_KEY, readSnoozes, snoozeStage, unsnoozeStage, visibleReminders } from './review-snooze';
import type { ReviewItem } from './review-reminders';

const now = new Date('2026-11-27T12:00:00.000Z');
const memory = (initial?: string) => {
  const data = new Map<string, string>(initial ? [[SNOOZE_STORAGE_KEY, initial]] : []);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const item = (stageId: string): ReviewItem => ({
  journeyId: 'j1', journeyTopic: 'T', stageId, stageOrder: 1, stageTitle: stageId, reason: { kind: 'cards', count: 1 },
});

describe('review snooze', () => {
  it('snoozes a stage for 3 days, kept in storage', () => {
    const storage = memory();
    const snoozes = snoozeStage(storage, 's1', now);
    expect(snoozes).toEqual({ s1: '2026-11-30T12:00:00.000Z' });
    expect(readSnoozes(storage, now)).toEqual(snoozes);
  });

  it('wakes a reminder once its snooze has ended, and drops ended snoozes', () => {
    const storage = memory();
    snoozeStage(storage, 's1', now);
    const later = new Date('2026-11-30T12:00:01.000Z');
    expect(readSnoozes(storage, later)).toEqual({});
    snoozeStage(storage, 's2', later);
    expect(Object.keys(JSON.parse(storage.data.get(SNOOZE_STORAGE_KEY) as string))).toEqual(['s2']);
  });

  it('undoes a snooze', () => {
    const storage = memory();
    snoozeStage(storage, 's1', now);
    expect(unsnoozeStage(storage, 's1', now)).toEqual({});
    expect(readSnoozes(storage, now)).toEqual({});
  });

  it('treats missing, broken or blocked storage as no snoozes', () => {
    expect(readSnoozes(null, now)).toEqual({});
    expect(readSnoozes(memory('not json'), now)).toEqual({});
    expect(readSnoozes(memory('[1,2]'), now)).toEqual({});
    expect(readSnoozes(memory('{"s1": 5}'), now)).toEqual({});
    const blocked = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(snoozeStage(blocked, 's1', now)).toEqual({ s1: '2026-11-30T12:00:00.000Z' });
  });

  it('leaves snoozed reminders out, lets the next ones move up, and counts only awake ones', () => {
    const items = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map(item);
    const shown = visibleReminders(items, { s1: '2026-11-30T12:00:00.000Z', s3: '2026-11-30T12:00:00.000Z' }, 5);
    expect(shown.items.map((i) => i.stageId)).toEqual(['s2', 's4', 's5', 's6', 's7']);
    expect(shown.total).toBe(5);
  });
});
