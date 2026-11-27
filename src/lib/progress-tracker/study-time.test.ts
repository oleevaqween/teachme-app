import { describe, expect, it } from 'vitest';
import {
  IDLE_MS,
  MAX_INCREMENT_SECONDS,
  createStudyTimer,
  isMissingStudyTimeTable,
  parseTimeBody,
  studyTimeLabel,
  totalStudyLabel,
  type TimeSendResult,
} from './study-time';

describe('parseTimeBody', () => {
  it('accepts whole seconds from 1 up to the cap', () => {
    expect(parseTimeBody({ seconds: 1 })).toEqual({ ok: true, seconds: 1 });
    expect(parseTimeBody({ seconds: MAX_INCREMENT_SECONDS })).toEqual({ ok: true, seconds: MAX_INCREMENT_SECONDS });
  });

  it('rejects zero, negatives, fractions, over the cap and wrong shapes', () => {
    for (const body of [{ seconds: 0 }, { seconds: -5 }, { seconds: 1.5 }, { seconds: MAX_INCREMENT_SECONDS + 1 }, { seconds: '60' }, {}, null, 'x']) {
      expect(parseTimeBody(body).ok).toBe(false);
    }
  });
});

describe('isMissingStudyTimeTable', () => {
  it('spots the driver error and the P2021 form for StageStudyTime only', () => {
    expect(isMissingStudyTimeTable(new Error('SQLITE_ERROR: no such table: main.StageStudyTime'))).toBe(true);
    expect(isMissingStudyTimeTable(Object.assign(new Error('The table `main.StageStudyTime` does not exist'), { code: 'P2021' }))).toBe(true);
    expect(isMissingStudyTimeTable(new Error('no such table: main.StageNote'))).toBe(false);
    expect(isMissingStudyTimeTable('no such table: main.StageStudyTime')).toBe(false);
  });
});

describe('studyTimeLabel', () => {
  it('shows nothing under a minute', () => {
    expect(studyTimeLabel(0)).toBeNull();
    expect(studyTimeLabel(59)).toBeNull();
  });

  it('shows minutes, then hours and minutes', () => {
    expect(studyTimeLabel(60)).toBe('1 min');
    expect(studyTimeLabel(25 * 60 + 40)).toBe('25 min');
    expect(studyTimeLabel(3600)).toBe('1 h');
    expect(studyTimeLabel(3600 + 5 * 60)).toBe('1 h 5 min');
    expect(studyTimeLabel(10 * 3600 + 59 * 60 + 59)).toBe('10 h 59 min');
  });

  it('labels the journey total', () => {
    expect(totalStudyLabel([30, 20])).toBeNull();
    expect(totalStudyLabel([1500, 3300])).toBe('Time studied: 1 h 20 min');
  });
});

/** A timer on a fake clock that records what it sends. */
function setup(results: TimeSendResult[] = []) {
  let clock = 0;
  const sent: { seconds: number; keepalive: boolean }[] = [];
  const timer = createStudyTimer({
    now: () => clock,
    send: async (seconds, keepalive) => {
      sent.push({ seconds, keepalive });
      return results.shift() ?? 'saved';
    },
  });
  /** Moves the clock forward in 5 s ticks, as the lesson view does. */
  const run = async (ms: number, everyTick?: () => void) => {
    for (let t = 0; t < ms; t += 5000) {
      clock += 5000;
      everyTick?.();
      timer.tick();
      await Promise.resolve();
    }
  };
  return { timer, sent, run, advance: (ms: number) => (clock += ms) };
}

describe('createStudyTimer', () => {
  it('counts time while the learner is active and sends it each minute', async () => {
    const { timer, sent, run } = setup();
    timer.activity();
    await run(60_000, () => timer.activity());
    expect(sent).toEqual([{ seconds: 60, keepalive: false }]);
  });

  it('keeps counting for up to 3 minutes after the last action, then stops', async () => {
    const { timer, sent, run } = setup();
    timer.activity();
    await run(10 * 60_000);
    const counted = sent.reduce((sum, s) => sum + s.seconds, 0);
    timer.dispose();
    const total = sent.reduce((sum, s) => sum + s.seconds, 0);
    expect(counted).toBe(180);
    expect(total).toBe(IDLE_MS / 1000);
  });

  it('does not count while the window is hidden', async () => {
    const { timer, sent, run } = setup();
    timer.activity();
    timer.setVisible(false);
    await run(120_000, () => timer.activity());
    timer.dispose();
    expect(sent).toEqual([]);
  });

  it('counts while a reply is arriving, even without input', async () => {
    const { timer, sent, run } = setup();
    timer.activity();
    timer.setBusy(true);
    await run(5 * 60_000);
    timer.dispose();
    expect(sent.reduce((sum, s) => sum + s.seconds, 0)).toBe(300);
  });

  it('stops counting a stuck reply 10 minutes after the last action', async () => {
    const { timer, sent, run } = setup();
    timer.activity();
    timer.setBusy(true);
    await run(60 * 60_000);
    timer.dispose();
    expect(sent.reduce((sum, s) => sum + s.seconds, 0)).toBe(600);
  });

  it('starts the reading window afresh when a long reply finishes', async () => {
    const { timer, sent, run } = setup();
    timer.activity();
    timer.setBusy(true);
    await run(5 * 60_000);
    timer.setBusy(false);
    await run(2 * 60_000);
    timer.dispose();
    expect(sent.reduce((sum, s) => sum + s.seconds, 0)).toBe(420);
  });

  it('ignores a long gap between ticks (the computer slept)', async () => {
    const { timer, sent, run, advance } = setup();
    timer.activity();
    await run(10_000, () => timer.activity());
    advance(2 * 3600_000);
    timer.activity();
    timer.tick();
    timer.dispose();
    expect(sent.reduce((sum, s) => sum + s.seconds, 0)).toBe(10);
  });

  it('sends what is left with keepalive when the lesson closes', async () => {
    const { timer, sent, run } = setup();
    timer.activity();
    await run(25_000, () => timer.activity());
    timer.dispose();
    expect(sent).toEqual([{ seconds: 25, keepalive: true }]);
    await run(60_000, () => timer.activity());
    expect(sent).toHaveLength(1);
  });

  it('keeps the time after a failed send and adds it to the next one', async () => {
    const { timer, sent, run } = setup(['error']);
    timer.activity();
    await run(60_000, () => timer.activity());
    await run(60_000, () => timer.activity());
    expect(sent.map((s) => s.seconds)).toEqual([60, 120]);
  });

  it('stops sending when the database has no study time table', async () => {
    const { timer, sent, run } = setup(['unavailable']);
    timer.activity();
    await run(5 * 60_000, () => timer.activity());
    timer.dispose();
    expect(sent).toHaveLength(1);
  });

  it('never sends more than the cap in one request', async () => {
    const { timer, sent, run } = setup(Array(40).fill('error'));
    timer.activity();
    timer.setBusy(true);
    await run(20 * 60_000);
    expect(Math.max(...sent.map((s) => s.seconds))).toBeLessThanOrEqual(MAX_INCREMENT_SECONDS);
  });
});
