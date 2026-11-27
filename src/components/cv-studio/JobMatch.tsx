'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { termGapStatus, type TermGapStatus, type TermImportance } from '@/lib/cv-studio/term-gaps';
import { analysisMatchesJob, jobMatchEstimate } from '@/lib/cv-studio/job-match';
import { type Resume, type Workspace } from '@/lib/cv-studio/schema';
import { tailoringIsCurrent } from '@/lib/cv-studio/tailoring';
import { importanceLabels } from '@/lib/cv-studio/plain-labels';

export type TermGapActions = {
  have: (term: string, importance: TermImportance) => void;
  lack: (term: string) => void;
  undo: (term: string) => void;
  open: (answerId: string) => void;
  learn: (term: string) => void;
};

/** The controls that can take focus after an action replaced the pressed button. */
export const TERM_GAP_FOCUS = 'button, a';

/**
 * After a user action the pressed button is replaced; moves focus to the first control of the replacement so keyboard users
 * are not dropped. Does nothing unless an action just happened; returns whether it acted.
 */
export function focusAfterAction(acted: { current: boolean }, root: Pick<ParentNode, 'querySelector'> | null): boolean {
  if (!acted.current) return false;
  acted.current = false;
  root?.querySelector<HTMLElement>(TERM_GAP_FOCUS)?.focus();
  return true;
}

/** Truthful choices for a job-advert term the CV does not mention; nothing here edits the CV. While TeachMe is busy the learning link is plain text. */
export function TermGapControls({ term, importance, status, actions, busy = false }: { term: string; importance: TermImportance; status: TermGapStatus; actions: TermGapActions; busy?: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const acted = useRef(false);
  useEffect(() => { focusAfterAction(acted, root.current); }, [status.kind]);
  const act = (run: () => void) => () => { acted.current = true; run(); };
  if (status.kind === 'not-held') return <span className="term-gap" aria-live="polite" ref={root}>
    <span>You said you don&apos;t have this yet.</span>
    {busy
      ? <span aria-disabled="true">Learn it in Teach Me</span>
      : <Link href="/teach-me" className="text-button" aria-label={'Learn it in Teach Me: ' + term} onClick={() => actions.learn(term)}>Learn it in Teach Me</Link>}
    <button type="button" className="text-button" aria-label={'Undo: ' + term} onClick={act(() => actions.undo(term))}>Undo</button>
  </span>;
  if (status.kind === 'waiting' || status.kind === 'answered') return <span className="term-gap" aria-live="polite" ref={root}>
    <span>{status.kind === 'waiting' ? 'Question waiting in your evidence guide.' : 'Answered. After you refresh the analysis, tailoring can use it.'}</span>
    <button type="button" className="text-button" aria-label={'Open: ' + term} onClick={() => actions.open(status.answerId)}>Open</button>
  </span>;
  return <span className="term-gap" aria-live="polite" ref={root}>
    {status.kind === 'skipped' && <span>Skipped.</span>}
    <button type="button" className="text-button" aria-label={'I have this: ' + term} onClick={act(() => actions.have(term, importance))}>I have this</button>
    <button type="button" className="text-button" aria-label={"I don't have this yet: " + term} onClick={act(() => actions.lack(term))}>I don&apos;t have this yet</button>
  </span>;
}

export function JobMatch({ workspace: w, proposed, gaps, busy = false }: { workspace: Workspace; proposed?: Resume; gaps?: TermGapActions; busy?: boolean }) {
  const current = jobMatchEstimate(w);
  const after = proposed ? jobMatchEstimate(w, proposed) : null;
  const ready = analysisMatchesJob(w) && tailoringIsCurrent(w) && current.score !== null;
  return <section className="job-match" aria-label="Job-match estimate">
    <div className="match-heading"><div><span className="studio-step">JOB-MATCH ESTIMATE</span><h3>How your CV speaks to this posting</h3></div>
      <div className="match-number">{ready ? current.score : '—'}<small>/ 100</small></div></div>
    {!ready ? <p>Prepare or refresh the tailoring review to extract this posting’s skills and calculate your score. Older saved analyses did not include this feature.</p> : <>
      <progress aria-label="Current CV job-match coverage" value={current.score!} max={100} />
      <p><strong>{current.requirementScore ?? '—'}% CV-backed requirement coverage · {current.phraseScore ?? '—'}% exact job-language coverage.</strong> {after && current.score !== null && after.score !== null && <>Proposed draft: <strong>{after.score}/100</strong> · {after.score < current.score ? 'This draft would reduce measured coverage; review its edits before applying.' : after.score === current.score ? 'Clearer writing can help even when the coverage score stays the same.' : 'Preview only; your CV changes after you apply the edits.'}</>}</p>
      <p><strong>Higher means this CV demonstrates more of this posting’s measured requirements and language.</strong> It does not mean you are more likely to be hired, and it cannot measure qualities the posting or CV does not state.</p>
      <details><summary>Matched phrases, gaps & calculation</summary>
        <p>Overall estimate = 70% CV-backed requirement coverage + 30% exact job-language coverage. Essential items carry 2 points; desirable items carry 1. Partial evidence earns half credit. The requirement component uses {current.requirementEarned} of {current.requirementPossible} verified points. The phrase component uses {current.earned} of {current.possible} points. Each phrase counts once, regardless of repetition.</p>
        <ul className="match-terms">{current.terms.map(t => <li key={t.term}><strong>{t.term}</strong><span>{importanceLabels[t.importance]} · {t.locations.length ? `Found in ${t.locations.join(', ')}` : 'Not present in CV wording'}</span>{gaps && !t.locations.length && <TermGapControls term={t.term} importance={t.importance} status={termGapStatus(w, t.term)} actions={gaps} busy={busy} />}</li>)}</ul>
        <p>{current.unverifiedRequirements ? `${current.unverifiedRequirements} requirement assessments are excluded until their posting/evidence citations can be verified. ` : ''}Only add missing terms when they truthfully describe your experience. A missing phrase may reflect different wording, not a missing skill. A matched phrase is not proof you meet the full requirement. Review the evidence assessment below too.</p>
      </details>
    </>}
    <small>This is TeachMe’s own estimate of how well your CV matches this posting. It is not an employer’s screening (ATS) score or a hiring probability. Notes, uploads and cover letters do not raise it.</small>
  </section>;
}
