import type { Workspace } from '@/lib/cv-studio/schema';
import { addTermQuestion, errorMessage, markNotHeld, termLearningInput, unmarkNotHeld } from '@/lib/cv-studio/term-gaps';
import type { TermGapActions } from './JobMatch';

export type TermGapDeps = {
  workspace: Workspace | null;
  change: (w: Workspace) => void;
  setError: (message: string) => void;
  /** Opens the evidence guide on one question. */
  openGuide: (answerId: string) => void;
  /** Hands a term to Teach Me before the link navigates. */
  learn: (input: ReturnType<typeof termLearningInput>) => void;
};

/** Keyword-gap actions for the job-match panel; each change goes through the normal autosave. */
export function termGapActions({ workspace: w, change, setError, openGuide, learn }: TermGapDeps): TermGapActions {
  return {
    have(term, importance) {
      if (!w) return;
      try {
        const added = addTermQuestion(w, term, importance);
        change(added.workspace);
        openGuide(added.answerId);
      } catch (e) { setError(errorMessage(e, 'The question could not be added.')); }
    },
    lack(term) {
      if (!w) return;
      try { change(markNotHeld(w, term)); } catch (e) { setError(errorMessage(e, 'This could not be recorded.')); }
    },
    undo(term) { if (w) change(unmarkNotHeld(w, term)); },
    open(answerId) { openGuide(answerId); },
    learn(term) { if (w) learn(termLearningInput(w, term)); },
  };
}
