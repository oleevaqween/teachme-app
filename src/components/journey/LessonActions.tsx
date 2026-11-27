'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LESSON_ACTIONS, LESSON_ACTION_LABELS, type LessonAction } from '@/lib/teaching-session-engine/lesson-actions';

const chipButton = cn(
  'rounded-full border border-border bg-background px-3 py-0.5 text-caption leading-5 font-medium sm:text-small text-foreground',
  'hover:bg-muted transition-colors',
  'disabled:opacity-50 disabled:cursor-not-allowed'
);

/** The row of lesson buttons under the message box; all disabled while a reply is streaming. */
export function LessonActionButtons({
  disabled,
  onAction,
  end,
}: {
  disabled: boolean;
  onAction: (action: LessonAction) => void;
  /** Pushed to the right end of the row (the Complete Stage button). */
  end?: ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lesson help">
      {LESSON_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action)}
          disabled={disabled}
          className={chipButton}
        >
          {LESSON_ACTION_LABELS[action]}
        </button>
      ))}
      </div>
      {end && <div className="ml-auto">{end}</div>}
    </div>
  );
}
