import { cleanRole, lessonActionLine, typedLessonAction, type LessonAction } from '@/lib/teaching-session-engine/lesson-actions';

export interface LessonMessageIds {
  journeyId: string;
  stageId: string;
  messageId: string;
}

/** What one send puts on screen and in the request body. */
export interface LessonMessage {
  /** The learner's line shown straight away (the server saves the same line). */
  message: string;
  /** The JSON body for POST /api/teaching-session/message. */
  body: LessonMessageIds & { message: string; action?: LessonAction; role?: string };
}

/**
 * Builds a lesson send: a typed message, or a lesson button with its visible line.
 * A typed message that is a button's line is sent as that button; a typed work line may name its own role.
 * The role goes only with 'work', and only when it is known. Returns null when there is nothing to send.
 */
export function lessonMessage(ids: LessonMessageIds, typed: string, action?: LessonAction, role?: string | null): LessonMessage | null {
  if (!action) {
    const asButton = typedLessonAction(typed);
    if (asButton) return lessonMessage(ids, '', asButton.action, asButton.role ?? role);
    const message = typed.trim();
    return message ? { message, body: { ...ids, message } } : null;
  }
  const known = action === 'work' ? cleanRole(role) : '';
  const message = lessonActionLine(action, known);
  return { message, body: { ...ids, message, action, ...(known ? { role: known } : {}) } };
}
