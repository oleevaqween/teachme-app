'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { InputMethod } from '@/lib/practice/schema';
import { createSpeechSession, MIC_BLOCKED, SPEECH_UNAVAILABLE, type SpeechRecognitionLike, type SpeechSession } from './speech-session';

export { MIC_BLOCKED, SPEECH_UNAVAILABLE };
export const SPEECH_NOTE = 'Chrome sends your audio to Google to turn it into text. Typing never leaves your computer except for AI feedback.';
export const SPEECH_NOTE_KEY = 'teachme.practice.speech-note.v1';

export function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function inputMethodFor(typed: boolean, spoken: boolean): InputMethod {
  if (spoken && typed) return 'mixed';
  return spoken ? 'spoken' : 'typed';
}

export function appendSpokenText(current: string, chunk: string): string {
  const addition = chunk.trim();
  if (!addition) return current;
  const base = current.trimEnd();
  return base ? base + ' ' + addition : addition;
}

const noSubscription = () => () => {};

/** Chrome speech-to-text into the answer box; final phrases go to onFinalText, interim text is exposed for display. */
export function useSpeechInput(onFinalText: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscription, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const session = useRef<SpeechSession | null>(null);
  const onFinal = useRef(onFinalText);

  useEffect(() => { onFinal.current = onFinalText; }, [onFinalText]);
  useEffect(() => () => { session.current?.dispose(); session.current = null; }, []);

  function start() {
    if (!session.current) {
      const Ctor = recognitionCtor();
      if (!Ctor) return;
      session.current = createSpeechSession(Ctor, {
        onFinal: text => onFinal.current(text),
        onInterim: setInterim,
        onState: state => {
          setListening(state.listening);
          if (state.error !== undefined) setError(state.error);
        },
      });
    }
    session.current.start();
  }

  function stop() {
    session.current?.stop();
  }

  return { supported, listening, interim, error, start, stop };
}
