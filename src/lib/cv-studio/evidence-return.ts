import { activeEvidenceGuide } from './evidence-schema';
import { analysisMatchesJob, jobMatch } from './job-match';
import type { Workspace } from './schema';
import { addTermQuestion, errorMessage, termQuestion, unmarkNotHeld, type TermImportance } from './term-gaps';

/** A finished Teach Me journey sent back through /cv-studio?open=APPLICATION_ID&evidence=TOPIC. */
export interface EvidenceReturn {
  applicationId: string;
  topic: string;
}

/** Reads `open` and `evidence` from an address-bar search; null unless both are present and not blank. */
export function readEvidenceReturn(search: string): EvidenceReturn | null {
  const params = new URLSearchParams(search);
  const topic = (params.get('evidence') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const applicationId = (params.get('open') ?? '').trim();
  return topic && applicationId ? { applicationId, topic } : null;
}

/** The same search without `evidence` (other parameters, such as `open`, are kept); '' when nothing is left. */
export function searchWithoutEvidence(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('evidence');
  const rest = params.toString();
  return rest ? '?' + rest : '';
}

/** What "Add evidence for TOPIC" does; working it out changes nothing. */
export type EvidenceOutcome =
  | { kind: 'open-question'; answerId: string }
  | { kind: 'have'; term: string; importance: TermImportance }
  | { kind: 'open-guide' };

const sameTerm = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * 1. TOPIC already has its guide question: open the guide at it.
 * 2. TOPIC is a missing keyword of the current job analysis: do what "I have this" does, and clear an earlier
 *    "I don't have this yet" mark on it in the same change.
 * 3. Otherwise: open the evidence guide.
 */
export function evidenceOutcome(w: Workspace, topic: string): EvidenceOutcome {
  const question = termQuestion(topic).toLocaleLowerCase();
  const existing = activeEvidenceGuide(w)?.answers.find((a) => a.question.toLocaleLowerCase() === question);
  if (existing) return { kind: 'open-question', answerId: existing.id };
  if (analysisMatchesJob(w)) {
    const missing = jobMatch(w.resume, w.jobDescription, w.analysis?.keywords ?? []).terms
      .find((t) => !t.locations.length && sameTerm(t.term, topic));
    if (missing) return { kind: 'have', term: missing.term, importance: missing.importance };
  }
  return { kind: 'open-guide' };
}

/**
 * "I have this" for a term after a finished journey: the term's question is added (once) exactly as
 * addTermQuestion does, and an earlier "I don't have this yet" mark on the term is cleared, as one workspace.
 */
export function haveAfterJourney(w: Workspace, term: string, importance: TermImportance): { workspace: Workspace; answerId: string } {
  const added = addTermQuestion(w, term, importance);
  return { workspace: unmarkNotHeld(added.workspace, term), answerId: added.answerId };
}

export type EvidenceReturnDeps = {
  /** One autosaved workspace change. */
  change: (w: Workspace) => void;
  setError: (message: string) => void;
  /** Opens the evidence guide at one question. */
  openQuestion: (answerId: string) => void;
  /** Opens the evidence guide. */
  openGuide: () => void;
  /** Called once the outcome went through; not called when the save fails, so the banner can stay for a retry. */
  done: () => void;
};

/** Runs the outcome for "Add evidence for TOPIC"; only the missing-keyword outcome writes, with a single change. */
export function addEvidenceFor(w: Workspace, topic: string, deps: EvidenceReturnDeps): EvidenceOutcome {
  const outcome = evidenceOutcome(w, topic);
  if (outcome.kind === 'have') {
    try {
      const added = haveAfterJourney(w, outcome.term, outcome.importance);
      deps.change(added.workspace);
      deps.openQuestion(added.answerId);
    } catch (e) {
      deps.setError(errorMessage(e, 'The question could not be added.'));
      return outcome;
    }
  } else if (outcome.kind === 'open-question') deps.openQuestion(outcome.answerId);
  else deps.openGuide();
  deps.done();
  return outcome;
}
