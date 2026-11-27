'use client';
import { Fragment, useMemo } from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { targetText, type Workspace } from '@/lib/cv-studio/schema';
import { checkCv } from '@/lib/cv-studio/cv-checker';
import { editCheck, type DiffPart } from '@/lib/cv-studio/edit-safety';
import { tailoringIsCurrent } from '@/lib/cv-studio/tailoring';
import { assessmentLabels, importanceLabels, sourceLabel, suggestionStatusLabels, targetLabel } from '@/lib/cv-studio/plain-labels';
import type { StudioController } from '../useStudioController';

/** The note shown when flagged edits were left out of Apply all and the tailored preview. */
function leftOutNote(count: number): string {
  return count === 1 ? '1 flagged edit was left out. Accept it on its own after checking it.' : `${count} flagged edits were left out. Accept each one on its own after checking it.`;
}

/** The word-by-word comparison: removed words struck through, added words highlighted, each with hidden text for screen readers. */
function ChangedWords({ parts }: { parts: DiffPart[] }) {
  return <p>{parts.map((part, i) => {
    // A removed line break joins two lines, so it shows as a space; kept and added line breaks break the line.
    if (part.text === '\n') return part.kind === 'removed' ? <Fragment key={i}> </Fragment> : <br key={i} />;
    const gap = i > 0 && parts[i - 1].text !== '\n' ? ' ' : '';
    if (part.kind === 'same') return <Fragment key={i}>{gap + part.text}</Fragment>;
    if (part.kind === 'removed') return <Fragment key={i}>{gap}<del><span className="sr-only">removed: </span>{part.text}</del></Fragment>;
    return <Fragment key={i}>{gap}<ins><span className="sr-only">added: </span>{part.text}</ins></Fragment>;
  })}</p>;
}

export function ReviewPanel({ c, w }: { c: StudioController; w: Workspace }) {
  const { freshAnalysis, openEvidence, draft, showTailored, setShowTailored, applyDraft, pending, decide, prepare, setTab } = c;
  // A guide holding only "don't have yet" terms has no questions to continue, so it counts as no guide here.
  const guide = c.guide?.answers.length ? c.guide : undefined;
  // Recomputed only when the CV, spelling result, market or page size changes, not on every render.
  const check = useMemo(
    () => checkCv(w.resume, undefined, c.spelling, { market: w.market, pageSize: w.layout.pageSize }),
    [w.resume, c.spelling, w.market, w.layout.pageSize]
  );
  return <>
            <div className="panel-intro"><span className="studio-step">02 / SHAPE THE EVIDENCE</span><h2>A deliberate improvement.</h2><p>Review what the role asks for, then choose the edits that sound like you.</p></div>
            {w.analysis ? <>
              {!freshAnalysis && <div className="inline-warning">This assessment describes an earlier CV snapshot. Applied edits are saved; prepare again to refresh the job assessment.</div>}
              <div className="analysis-overview"><h3>{w.analysis.role}{w.analysis.company ? ' · ' + w.analysis.company : ''}</h3><p>{w.analysis.overview}</p><div className="assessment-counts"><span><strong>{w.analysis.requirements.filter(r => r.assessment === 'supported').length}</strong> {assessmentLabels.supported.toLowerCase()}</span><span><strong>{w.analysis.requirements.filter(r => r.assessment === 'partial').length}</strong> {assessmentLabels.partial.toLowerCase()}</span><span><strong>{w.analysis.requirements.filter(r => r.assessment === 'not-recorded').length}</strong> {assessmentLabels['not-recorded'].toLowerCase()}</span>{w.analysis.requirements.some(r => r.assessment === 'unverified') && <span><strong>{w.analysis.requirements.filter(r => r.assessment === 'unverified').length}</strong> {assessmentLabels.unverified.toLowerCase()}</span>}</div><small>How much of this job your CV already shows. This is not an employer&apos;s screening score. &ldquo;Couldn&apos;t confirm&rdquo; means the AI&apos;s check could not be verified, not that you lack the skill.</small></div>
              <h3 className="subheading">What the role needs</h3>
              {w.analysis.requirements.map((r, i) => <details className="requirement" key={i}><summary><span>{r.requirement}<small>{importanceLabels[r.importance]}</small></span><span className={'evidence-badge ' + r.assessment}>{assessmentLabels[r.assessment]}</span></summary><p>{r.explanation}</p>{r.jobQuote && <blockquote>Job posting: “{r.jobQuote}”</blockquote>}{r.evidence.map((e, j) => <blockquote key={j}>{sourceLabel(e.source, w)}<br />“{e.quote}”</blockquote>)}</details>)}
              {(w.analysis.questions.length > 0 || guide) && <div className="question-panel"><h3>A few details could make this stronger</h3><p>We will walk through each question, explain what would help, and let you attach reviewed evidence. You can skip or pause at any time.</p>{w.analysis.questions.map((q, i) => <div key={i}><strong>{q.question}</strong><p>{q.why}</p></div>)}<button className="studio-button secondary" onClick={openEvidence}>Add answers to your evidence <ArrowRight size={15} /></button></div>}
              <div className="tailoring-panel"><h3>Your tailored CV draft</h3><p>{draft?.edits.length ? `${draft.edits.length} verified section edits are ready. Read the proposed document and the before/after changes below, then apply the edits you want.` : draft?.flagged ? 'Your current CV is shown. The edits below need a check before you accept them, so none can be applied together.' : 'Your current CV is shown. Refresh tailoring to review the whole document against this posting.'}</p>
                {!!draft?.edits.length && <><div className="suggestion-actions"><button className="studio-button secondary" aria-pressed={showTailored} onClick={() => setShowTailored(!showTailored)}>{showTailored ? 'Show current CV' : 'Preview tailored CV'}</button><button className="studio-button" disabled={w.kind !== 'application'} onClick={() => void applyDraft()}><Check size={15} /> Apply all {draft.edits.length} reviewed edits</button></div><p className="studio-hint">Applying changes this application only. A checkpoint preserves the previous version. Exports use applied edits, never an unapproved preview.</p></>}
                {!!draft?.flagged && <p className="inline-warning">{leftOutNote(draft.flagged)}</p>}
                {!!draft?.blocked && <p className="inline-warning">{draft.blocked} pending edits are stale, unchanged or conflicting and will not be applied together. Refresh tailoring to resolve them.</p>}
                {!!w.analysis.sectionReview?.length && <details><summary>Whole-CV section review</summary>{w.analysis.sectionReview.map((item, index) => <p key={index}><strong>{targetLabel(item.target, w)}</strong><br />{item.reason}</p>)}<p>This is the writing plan. Only edits which passed the checks appear below.</p></details>}
              </div>
              <h3 className="subheading">Before & after <small>{pending} edits to review</small></h3>
              {!!w.analysis.notices?.length && <div className="inline-warning" role="status"><strong>Some results need review</strong>{w.analysis.notices.map((message, i) => <p key={i}>{message}</p>)}<p>You can review the analysis and any verified suggestions below. No proposed rewrite is applied automatically.</p></div>}
              {w.analysis.suggestions.length === 0 && <p className="studio-hint">No supported rewrites were returned. Your original wording is unchanged. Review the role analysis and questions above; add genuine supporting details under Evidence and notes if needed, then refresh the analysis.</p>}
              {w.analysis.suggestions.map(s => { const check = editCheck(s); return <div className={'suggestion ' + s.status} key={s.id}>
                <div className="suggestion-head"><strong>{targetLabel(s.target, w)}</strong><span>{suggestionStatusLabels[s.status]}</span></div>
                <p>{s.reason}</p><div className="before-after"><div><small>BEFORE</small><p>{s.before || '(Empty)'}</p></div>{check && <div className="edit-changes"><small>Changes</small><ChangedWords parts={check.changes} /></div>}<div><small>SUGGESTED</small><p>{s.after}</p></div></div>
                {!check && <p className="studio-hint">Change check unavailable.</p>}
                {!!s.warnings?.length && <ul className="studio-hint voice-warnings" aria-label="Writing suggestions">{s.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
                <details><summary>See the supporting evidence</summary>{s.evidence.map((e, i) => <blockquote key={i}>{sourceLabel(e.source, w)}<br />“{e.quote}”</blockquote>)}</details>
                {!!check?.flags.length && <div className="edit-check"><strong>Check this change</strong><ul>{check.flags.map((flag, i) => <li key={i}>{flag}</li>)}</ul></div>}
                {s.status === 'pending' && <div className="suggestion-actions"><button className="studio-button" disabled={targetText(w.resume, s.target) !== s.before || !tailoringIsCurrent(w) || w.kind !== 'application'} onClick={() => void decide(s, true)}><Check size={15} /> Accept edit</button><button className="studio-button secondary" onClick={() => void decide(s, false)}>Keep original</button></div>}
              </div>; })}
              <button className="studio-button secondary wide" onClick={() => void prepare('analyze')}><Sparkles size={15} /> Refresh match & tailoring</button>
              <button className="studio-button wide" onClick={() => setTab('package')}>Continue to letter & interview practice <ArrowRight size={15} /></button>
            </> : <div className="tab-empty"><Sparkles size={28} /><h3>Start with a job posting</h3><p>We will map requirements to your evidence and propose individual edits.</p><button className="studio-button" onClick={() => setTab('job')}>Add a target role</button></div>}
            <div className="checker-summary"><p><strong>CV quality: {check.score}/100 · {check.label}</strong></p><button type="button" className="studio-button secondary" onClick={() => setTab('checker')}>Open CV checker</button></div>
          </>;
}
