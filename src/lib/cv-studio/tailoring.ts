import { analysisSignature, inputSignature, sameInputs, applySuggestion, targetText, type Resume, type Suggestion, type Workspace } from './schema';
import { analysisMatchesJob } from './job-match';
import { isFlagged } from './edit-safety';

export function tailoringIsCurrent(w: Workspace) {
  if (!analysisMatchesJob(w)) return false;
  // Reconstruct the assessed snapshot only through recorded, accepted edits.
  // Any independent profile/evidence edit requires a fresh review.
  let resume = w.resume;
  for (const s of [...(w.analysis?.suggestions ?? [])].reverse()) {
    if (s.status === 'accepted' && targetText(resume, s.target) === s.after) {
      resume = applySuggestion(resume, { ...s, before: s.after, after: s.before });
    }
  }
  const assessed = { ...w, resume };
  return sameInputs(w.analysisInput, analysisSignature(assessed)) || sameInputs(w.analysisInput, inputSignature(assessed));
}

/** Build only a preview. Conflicting, stale and already-decided edits cannot
 * silently overwrite one another or roll back a user's newer text. Flagged edits
 * (a fixed rule fired or the check failed) are left out and counted as flagged;
 * the user accepts each one on its own. Blocked counts only stale, unchanged or conflicting edits. */
export function tailoredDraft(w: Workspace): { resume: Resume; edits: Suggestion[]; blocked: number; flagged: number } {
  const pending = w.analysis?.suggestions.filter(s => s.status === 'pending') ?? [];
  const ready = tailoringIsCurrent(w) ? pending.filter(s => s.before !== s.after &&
    targetText(w.resume, s.target) === s.before &&
    pending.filter(other => other.target === s.target || other.id === s.id).length === 1) : [];
  const edits = ready.filter(s => !isFlagged(s));
  return { resume: edits.reduce((resume, edit) => applySuggestion(resume, edit), w.resume), edits, blocked: pending.length - ready.length, flagged: ready.length - edits.length };
}

export function acceptTailoredDraft(w: Workspace): Workspace {
  if (w.kind !== 'application') throw new Error('Create a separate application before applying tailored edits. Your master CV is protected.');
  const draft = tailoredDraft(w);
  if (!w.analysis || !draft.edits.length) throw new Error('No current, non-conflicting edits are ready. Refresh the tailoring review first.');
  const ids = new Set(draft.edits.map(s => s.id));
  return { ...w, resume: draft.resume, analysis: { ...w.analysis,
    suggestions: w.analysis.suggestions.map(s => ids.has(s.id) ? { ...s, status: 'accepted' as const } : s),
  } };
}
