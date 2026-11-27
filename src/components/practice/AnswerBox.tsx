'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send } from 'lucide-react';
import { formatElapsed } from '@/components/cv-studio/WorkingBanner';
import { MAX_ANSWER, MIN_ANSWER, type InputMethod } from '@/lib/practice/schema';
import { TIMER_GUIDE_SECONDS, useAnswerTimer } from './useAnswerTimer';
import { SPEECH_NOTE, SPEECH_NOTE_KEY, appendSpokenText, inputMethodFor, useSpeechInput } from './useSpeechInput';

export type AnswerSubmission = { answer: string; durationSeconds: number; inputMethod: InputMethod };

export function AnswerBox({ disabled, hidden = false, onSubmit, onDraftChange, initialText = '', onTextChange }: {
  disabled: boolean;
  hidden?: boolean;
  onSubmit: (submission: AnswerSubmission) => void;
  onDraftChange?: (hasText: boolean) => void;
  /** Starting text, read once when the box mounts. */
  initialText?: string;
  /** Called with the full text after every change, typed or spoken. */
  onTextChange?: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [typed, setTyped] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const timer = useAnswerTimer();
  // Reports each change without re-running when the parent passes a new callback on every render.
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);
  useEffect(() => {
    onTextChangeRef.current?.(text);
  }, [text]);
  const speech = useSpeechInput(chunk => {
    setText(current => appendSpokenText(current, chunk));
    onDraftChange?.(true);
    setSpoken(true);
  });
  const stopSpeech = speech.stop;
  // Stop listening while hidden; the timer keeps running because it measures the draft's elapsed time.
  useEffect(() => {
    if (hidden) stopSpeech();
  }, [hidden, stopSpeech]);
  const length = text.trim().length;
  const tooLong = length > MAX_ANSWER;
  const overGuide = timer.seconds >= TIMER_GUIDE_SECONDS;

  function toggleMic() {
    if (speech.listening) { speech.stop(); return; }
    let seen = false;
    try { seen = localStorage.getItem(SPEECH_NOTE_KEY) === '1'; } catch { /* Storage may be blocked; the note just shows again. */ }
    if (!seen) {
      setShowNote(true);
      try { localStorage.setItem(SPEECH_NOTE_KEY, '1'); } catch { /* See above. */ }
    }
    timer.start();
    speech.start();
  }

  function submit() {
    // A late final phrase can arrive after stop(), so submitting waits until the user stops the mic.
    if (disabled || speech.listening || length < MIN_ANSWER || tooLong) return;
    onSubmit({ answer: text.trim(), durationSeconds: Math.min(3600, timer.elapsedNow()), inputMethod: inputMethodFor(typed, spoken) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="practice-answer" className="text-small font-medium text-foreground">Your answer</label>
        <span role="timer" aria-live="off" className={`font-mono text-small ${overGuide ? 'text-primary' : 'text-muted-foreground'}`}>
          {formatElapsed(timer.seconds)}{overGuide ? ' · Aim for about 2 minutes' : ''}
        </span>
      </div>
      {showNote && <p role="note" className="rounded-lg bg-accent p-3 text-small text-accent-foreground">{SPEECH_NOTE}</p>}
      <textarea
        id="practice-answer"
        value={text}
        rows={8}
        maxLength={MAX_ANSWER}
        disabled={disabled}
        placeholder="Answer as you would out loud: the situation, your task, what you did, and the result."
        onChange={e => { setText(e.target.value); onDraftChange?.(e.target.value.trim().length > 0); setTyped(true); timer.start(); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
        className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      />
      {speech.interim && <p className="text-small italic text-muted-foreground" aria-live="polite">{speech.interim}</p>}
      {speech.error && <p role="alert" className="text-small text-destructive">{speech.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={disabled || speech.listening || length < MIN_ANSWER || tooLong}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Send className="size-4" aria-hidden="true" /> Submit for feedback
        </button>
        {speech.listening && <span role="note" className="text-small text-muted-foreground">Stop speaking to submit.</span>}
        {speech.supported && (
          <button type="button" onClick={toggleMic} disabled={disabled || hidden} aria-label="Speak your answer" aria-pressed={speech.listening}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-small hover:bg-muted disabled:opacity-50">
            {speech.listening ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
            {speech.listening ? 'Stop speaking' : 'Speak your answer'}
          </button>
        )}
        <span className="ml-auto text-caption text-muted-foreground">
          {tooLong && <span role="alert" className="mr-2 text-small text-destructive">Your answer is over {MAX_ANSWER} characters; please shorten it.</span>}
          {length < MIN_ANSWER ? `At least ${MIN_ANSWER} characters` : `${length}/${MAX_ANSWER}`}
        </span>
      </div>
    </div>
  );
}
