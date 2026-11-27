'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  MAX_NOTE_LENGTH,
  NOTE_COUNTER_FROM,
  NOTES_UNAVAILABLE_MESSAGE,
  type NoteSaveStatus,
} from '@/lib/teaching-session-engine/stage-note';

/** The line under the notes box for each save status. */
export function noteStatusLine(status: NoteSaveStatus): string {
  switch (status) {
    case 'loading':
      return 'Loading your notes…';
    case 'load-error':
      return "Couldn't load your notes.";
    case 'idle':
      return 'Saved as you type. Kept when you reset the conversation.';
    case 'pending':
      return 'Saving…';
    case 'saved':
      return 'All changes saved.';
    case 'error':
      return "Couldn't save just now. Your text is still here.";
    case 'unavailable':
      return NOTES_UNAVAILABLE_MESSAGE;
  }
}

/** The notes panel inside the lesson header's Notes popup. Focuses the box when it opens. */
export function StageNotes({
  text,
  status,
  onChange,
  onRetrySave,
  onReload,
}: {
  text: string;
  status: NoteSaveStatus;
  onChange: (value: string) => void;
  onRetrySave: () => void;
  onReload: () => void;
}) {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const editable = status !== 'loading' && status !== 'load-error' && status !== 'unavailable';

  useEffect(() => {
    if (editable) boxRef.current?.focus();
    // Only when the panel opens or editing first becomes possible.
  }, [editable]);

  const retry = status === 'error' ? onRetrySave : status === 'load-error' ? onReload : null;
  const problem = status === 'error' || status === 'load-error' || status === 'unavailable';

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={boxRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={!editable}
        maxLength={MAX_NOTE_LENGTH}
        rows={8}
        placeholder="Write what you want to remember from this stage."
        aria-label="Your notes for this stage"
        className={cn(
          'w-full resize-none rounded-md border border-border bg-background px-3 py-2',
          'text-small text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p
          aria-live="polite"
          className={cn('text-caption', problem ? 'text-destructive' : 'text-muted-foreground')}
        >
          {noteStatusLine(status)}
          {retry && (
            <>
              {' '}
              <button
                type="button"
                onClick={retry}
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                Try again
              </button>
            </>
          )}
        </p>
        {text.length >= NOTE_COUNTER_FROM && (
          <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
            {text.length.toLocaleString('en-GB')} / {MAX_NOTE_LENGTH.toLocaleString('en-GB')}
          </span>
        )}
      </div>
    </div>
  );
}
