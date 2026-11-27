/** The in-memory draft slot for one answer box: a question's main answer or one of its follow-ups. */
export function draftKey(questionId: string, followUpOfId: string | null): string {
  return `${questionId}:${followUpOfId ?? 'main'}`;
}

/** True when a request was stopped by the user pressing Cancel (an AbortController abort). */
export function isCancelled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}
