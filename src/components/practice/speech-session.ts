export const MIC_BLOCKED = "Microphone unavailable. Check Chrome's microphone permission for this site.";
export const SPEECH_UNAVAILABLE = "Speech recognition isn't available right now. You can keep typing.";

type SpeechResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechState = { listening: boolean; error?: string };

export type SpeechSessionCallbacks = {
  onFinal(text: string): void;
  onInterim(text: string): void;
  /** `error` is omitted when the message should be left unchanged. */
  onState(state: SpeechState): void;
};

export type SpeechSession = { start(): void; stop(): void; dispose(): void };

/** Maps a recognition error code to a user message; '' means a quiet end. */
export function messageForError(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return MIC_BLOCKED;
  if (code === 'no-speech' || code === 'aborted') return '';
  return SPEECH_UNAVAILABLE;
}

function detach(r: SpeechRecognitionLike) {
  r.onresult = null;
  r.onerror = null;
  r.onend = null;
}

/**
 * React-free recognition lifecycle: one active recognition at a time. After stop() an instance
 * keeps forwarding its FINAL results (Chrome delivers the last phrase late) until its own
 * onend/onerror; a stopping instance never touches listening/error state.
 */
export function createSpeechSession(Ctor: new () => SpeechRecognitionLike, cb: SpeechSessionCallbacks): SpeechSession {
  let active: SpeechRecognitionLike | null = null;
  const stopping = new Set<SpeechRecognitionLike>();
  let disposed = false;

  function finish(r: SpeechRecognitionLike, error?: string) {
    if (disposed) return;
    if (stopping.delete(r)) return;
    if (active !== r) return;
    active = null;
    cb.onInterim('');
    cb.onState(error === undefined ? { listening: false } : { listening: false, error });
  }

  function start() {
    if (disposed || active) return;
    let r: SpeechRecognitionLike;
    try {
      r = new Ctor();
    } catch {
      cb.onState({ listening: false, error: SPEECH_UNAVAILABLE });
      return;
    }
    r.continuous = true;
    r.interimResults = true;
    r.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';
    r.onresult = event => {
      if (disposed) return;
      if (active !== r) {
        if (!stopping.has(r)) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) cb.onFinal(result[0].transcript);
        }
        return;
      }
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) cb.onFinal(result[0].transcript);
        else pending += result[0].transcript;
      }
      cb.onInterim(pending);
    };
    r.onerror = event => finish(r, messageForError(event.error));
    r.onend = () => finish(r);
    active = r;
    cb.onState({ listening: true, error: '' });
    try {
      r.start();
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      detach(r);
      finish(r, name === 'NotAllowedError' ? MIC_BLOCKED : SPEECH_UNAVAILABLE);
    }
  }

  function stop() {
    if (disposed || !active) return;
    const r = active;
    active = null;
    stopping.add(r);
    try {
      r.stop();
    } catch {
      // The recognition is already stopped; nothing more to do.
    }
    cb.onInterim('');
    cb.onState({ listening: false });
  }

  function dispose() {
    disposed = true;
    const all = [...stopping];
    if (active) all.push(active);
    active = null;
    stopping.clear();
    for (const r of all) {
      detach(r);
      try {
        if (r.abort) r.abort();
        else r.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  return { start, stop, dispose };
}
