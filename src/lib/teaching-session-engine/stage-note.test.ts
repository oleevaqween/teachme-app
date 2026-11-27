import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_NOTE_LENGTH,
  createNoteSaver,
  isMissingNotesTable,
  parseNoteBody,
  type NoteSaveStatus,
  type SaveResult,
} from './stage-note';

describe('parseNoteBody', () => {
  it('accepts a string content', () => {
    expect(parseNoteBody({ content: 'Scope is the work.' })).toEqual({ ok: true, content: 'Scope is the work.' });
  });

  it('keeps the text exactly as typed, including line breaks', () => {
    expect(parseNoteBody({ content: '  one\n\ntwo  ' })).toEqual({ ok: true, content: '  one\n\ntwo  ' });
  });

  it('rejects a missing, non-string or non-object body', () => {
    expect(parseNoteBody(null).ok).toBe(false);
    expect(parseNoteBody('text').ok).toBe(false);
    expect(parseNoteBody({}).ok).toBe(false);
    expect(parseNoteBody({ content: 42 }).ok).toBe(false);
  });

  it('accepts the maximum length and rejects one character more', () => {
    expect(parseNoteBody({ content: 'a'.repeat(MAX_NOTE_LENGTH) }).ok).toBe(true);
    const over = parseNoteBody({ content: 'a'.repeat(MAX_NOTE_LENGTH + 1) });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain('10,000');
  });
});

describe('isMissingNotesTable', () => {
  it('spots the driver error for a database without the StageNote table', () => {
    const error = Object.assign(new Error('SQLITE_ERROR: no such table: main.StageNote'), { name: 'DriverAdapterError' });
    expect(isMissingNotesTable(error)).toBe(true);
  });

  it("also spots Prisma's P2021 form for the StageNote table", () => {
    const error = Object.assign(new Error('The table `main.StageNote` does not exist in the current database.'), { code: 'P2021' });
    expect(isMissingNotesTable(error)).toBe(true);
    const other = Object.assign(new Error('The table `main.Stage` does not exist in the current database.'), { code: 'P2021' });
    expect(isMissingNotesTable(other)).toBe(false);
  });

  it('ignores other errors, including other missing tables', () => {
    expect(isMissingNotesTable(new Error('SQLITE_BUSY: database is locked'))).toBe(false);
    expect(isMissingNotesTable(new Error('no such table: main.Stage'))).toBe(false);
    expect(isMissingNotesTable('no such table: main.StageNote')).toBe(false);
  });
});

describe('createNoteSaver', () => {
  let sent: { content: string; keepalive: boolean }[];
  let statuses: NoteSaveStatus[];
  let results: SaveResult[];

  function saver(delayMs = 800) {
    return createNoteSaver({
      delayMs,
      send: async (content, keepalive) => {
        sent.push({ content, keepalive });
        return results.shift() ?? 'saved';
      },
      onStatus: (status) => statuses.push(status),
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    statuses = [];
    results = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits until typing pauses, then sends only the latest text', async () => {
    const s = saver();
    s.change('S');
    s.change('Sc');
    s.change('Scope');
    expect(sent).toEqual([]);
    expect(statuses.at(-1)).toBe('pending');
    await vi.advanceTimersByTimeAsync(799);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([{ content: 'Scope', keepalive: false }]);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('sends saves one after another, in the order they were typed', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const s = createNoteSaver({
      delayMs: 10,
      send: (content) => {
        order.push(`start ${content}`);
        return new Promise<SaveResult>((resolve) => {
          release = () => {
            order.push(`end ${content}`);
            resolve('saved');
          };
        });
      },
      onStatus: () => {},
    });
    s.change('first');
    await vi.advanceTimersByTimeAsync(10);
    s.change('second');
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(['start first']);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['start first', 'end first', 'start second']);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order.at(-1)).toBe('end second');
  });

  it('does not report saved while newer typing is still waiting', async () => {
    const s = saver(10);
    s.change('one');
    await vi.advanceTimersByTimeAsync(10);
    s.change('one two');
    expect(statuses.at(-1)).toBe('pending');
  });

  it('reports a failed save and sends the same text again on retry', async () => {
    results = ['error'];
    const s = saver(10);
    s.change('keep me');
    await vi.advanceTimersByTimeAsync(10);
    expect(statuses.at(-1)).toBe('error');
    s.retry('keep me');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((x) => x.content)).toEqual(['keep me', 'keep me']);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('reports a database without the notes table as unavailable', async () => {
    results = ['unavailable'];
    const s = saver(10);
    s.change('text');
    await vi.advanceTimersByTimeAsync(10);
    expect(statuses.at(-1)).toBe('unavailable');
  });

  it('on dispose, sends waiting text at once with keepalive and nothing after', async () => {
    const s = saver();
    s.change('leaving now');
    s.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([{ content: 'leaving now', keepalive: true }]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(1);
    s.change('ignored after dispose');
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(1);
  });

  it('a failed save is sent again with keepalive when the lesson closes', async () => {
    results = ['error'];
    const s = saver(10);
    s.change('do not lose me');
    await vi.advanceTimersByTimeAsync(10);
    expect(statuses.at(-1)).toBe('error');
    s.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([
      { content: 'do not lose me', keepalive: false },
      { content: 'do not lose me', keepalive: true },
    ]);
  });

  it('a failed save does not retry by itself while the lesson stays open', async () => {
    results = ['error'];
    const s = saver(10);
    s.change('wait for me');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toHaveLength(1);
    s.flush(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.at(-1)).toEqual({ content: 'wait for me', keepalive: true });
  });

  it('a save that fails after the lesson closed is sent once more with keepalive', async () => {
    results = ['error'];
    let finish: () => void = () => {};
    const gate = new Promise<void>((r) => (finish = r));
    const s = createNoteSaver({
      delayMs: 10,
      send: async (content, keepalive) => {
        sent.push({ content, keepalive });
        if (!keepalive) await gate;
        return results.shift() ?? 'saved';
      },
      onStatus: (status) => statuses.push(status),
    });
    s.change('in flight');
    await vi.advanceTimersByTimeAsync(10);
    s.dispose();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([
      { content: 'in flight', keepalive: false },
      { content: 'in flight', keepalive: true },
    ]);
  });

  it('a keepalive flush goes out at once, not behind a save still in flight', async () => {
    const s = createNoteSaver({
      delayMs: 10,
      send: (content, keepalive) => {
        sent.push({ content, keepalive });
        return keepalive ? Promise.resolve('saved') : new Promise<SaveResult>(() => {});
      },
      onStatus: () => {},
    });
    s.change('first');
    await vi.advanceTimersByTimeAsync(10);
    s.change('first and more');
    s.flush(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([
      { content: 'first', keepalive: false },
      { content: 'first and more', keepalive: true },
    ]);
  });

  it('on dispose with nothing waiting, sends nothing', async () => {
    const s = saver();
    s.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([]);
  });

  it('flush(true) sends waiting text with keepalive without waiting for the pause', async () => {
    const s = saver();
    s.change('page closing');
    s.flush(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([{ content: 'page closing', keepalive: true }]);
  });
});
