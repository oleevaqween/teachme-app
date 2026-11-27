// src/lib/teaching-session-engine/stage-note.ts
//
// Client-safe: the rules for a stage's notes (one notepad per stage) and the save queue
// the lesson view uses to save them as the learner types.

/** Longest note kept for one stage, in characters. */
export const MAX_NOTE_LENGTH = 10_000;

/** The character counter shows from this length up. */
export const NOTE_COUNTER_FROM = 9_000;

/** Shown when the database has not been updated for notes yet. */
export const NOTES_UNAVAILABLE_MESSAGE =
  'Notes need a quick database update. Close TeachMe, run npm run db:setup, then start it again. Your lessons are not affected.';

export type NoteBody = { ok: true; content: string } | { ok: false; error: string };

/** Checks a PUT body: `{ content: string }` of at most MAX_NOTE_LENGTH characters, kept exactly as typed. */
export function parseNoteBody(body: unknown): NoteBody {
  if (!body || typeof body !== 'object' || typeof (body as { content?: unknown }).content !== 'string') {
    return { ok: false, error: 'Send the note as { content: string }.' };
  }
  const content = (body as { content: string }).content;
  if (content.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Notes can be up to ${MAX_NOTE_LENGTH.toLocaleString('en-GB')} characters.` };
  }
  return { ok: true, content };
}

/** True for the error a database without the StageNote table gives (before `npm run db:setup`). */
export function isMissingNotesTable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/no such table: (main\.)?"?StageNote"?\b/i.test(error.message)) return true;
  // Prisma's own form, should the adapter ever map the driver error.
  return (error as { code?: unknown }).code === 'P2021' && /\bStageNote\b/.test(error.message);
}

/** What the notes panel shows about saving. */
export type NoteSaveStatus = 'loading' | 'load-error' | 'idle' | 'pending' | 'saved' | 'error' | 'unavailable';

/** The outcome of one save request. */
export type SaveResult = 'saved' | 'error' | 'unavailable';

export type NoteSaver = {
  /** The text changed: save it once typing pauses. */
  change(content: string): void;
  /** Send any waiting text now (keepalive when the page is going away). */
  flush(keepalive?: boolean): void;
  /** Send this text again after a failed save. */
  retry(content: string): void;
  /** Send any waiting text now with keepalive, then stop. */
  dispose(): void;
};

/**
 * Saves a note after typing pauses for `delayMs`. Requests go one at a time in typing order,
 * so an older save can never land after a newer one. Status is 'saved' only when nothing newer is waiting.
 */
export function createNoteSaver(options: {
  send: (content: string, keepalive: boolean) => Promise<SaveResult>;
  onStatus: (status: NoteSaveStatus) => void;
  delayMs?: number;
}): NoteSaver {
  const delayMs = options.delayMs ?? 800;
  let waiting: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;

  const report = (status: NoteSaveStatus) => {
    if (!disposed) options.onStatus(status);
  };

  const attempt = async (content: string, keepalive: boolean): Promise<SaveResult> => {
    try {
      return await options.send(content, keepalive);
    } catch {
      return 'error';
    }
  };

  // After a failed save the text waits again (no timer: retrying stays the learner's choice), so leaving
  // the lesson or the page still sends it. If the lesson has already closed, it is sent once more at once.
  const settle = (content: string, result: SaveResult) => {
    if (result === 'saved') {
      if (waiting === null) report('saved');
      return;
    }
    if (result === 'error' && waiting === null) {
      if (disposed) void attempt(content, true);
      else waiting = content;
    }
    report(result);
  };

  const flush = (keepalive = false) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (waiting === null) return;
    const content = waiting;
    waiting = null;
    if (keepalive) {
      // The page may be going away: send now rather than behind a save still in flight.
      void attempt(content, true).then((result) => settle(content, result));
      return;
    }
    queue = queue.then(async () => settle(content, await attempt(content, false)));
  };

  return {
    change(content) {
      if (disposed) return;
      waiting = content;
      report('pending');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => flush(false), delayMs);
    },
    flush,
    retry(content) {
      if (disposed) return;
      waiting = content;
      report('pending');
      flush(false);
    },
    dispose() {
      if (disposed) return;
      flush(true);
      disposed = true;
    },
  };
}
