import type { SpellingOutcome } from '@/lib/cv-studio/cv-checker';

export type SpellingState = { key: string; outcome: SpellingOutcome };
export type LastDoneSpelling = { workspaceId: string; outcome: SpellingOutcome };

const PENDING: SpellingOutcome = { status: 'pending' };

/**
 * The spelling outcome to score and show. A result for the current text wins (done or failed). While a new check is pending,
 * the last finished result for the same CV stays in use so the score does not jump; another CV never borrows it.
 */
export function currentSpelling(state: SpellingState, lastDone: LastDoneSpelling | null, key: string, workspaceId: string | undefined): SpellingOutcome {
  if (state.key === key) return state.outcome;
  if (lastDone && workspaceId !== undefined && lastDone.workspaceId === workspaceId) return lastDone.outcome;
  return PENDING;
}
