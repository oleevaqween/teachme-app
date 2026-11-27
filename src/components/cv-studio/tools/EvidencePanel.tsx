'use client';
import { ArrowRight } from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import { Field } from '../Field';
import type { StudioController } from '../useStudioController';

export function EvidencePanel({ c, w }: { c: StudioController; w: Workspace }) {
  const { update, openEvidence } = c;
  // A guide holding only "don't have yet" terms has no questions to continue, so it counts as no guide here.
  const guide = c.guide?.answers.length ? c.guide : undefined;
  return <>
            <div className="panel-intro"><h2>Evidence and notes</h2><p>Answer follow-up questions with real examples, and keep notes that guide tailoring and your letter. Nothing here edits your CV directly.</p></div>
            <div className="evidence-launch"><span className="studio-step">LET US GUIDE YOU</span><h3>Fill the gaps, one question at a time.</h3><p>{w.analysis?.questions.length || guide ? 'Answer the follow-up questions, add a reviewed document excerpt, or save your progress for later.' : 'Prepare your application first. If more detail would help, we will guide you through the follow-up questions here.'}</p>{(!!w.analysis?.questions.length || !!guide) && <button className="studio-button secondary" onClick={openEvidence}>{guide ? 'Continue guided evidence' : 'Answer questions with guidance'} <ArrowRight size={15} /></button>}{guide && <small>{guide.answers.filter(a => a.status === 'answered').length} confirmed · {guide.answers.filter(a => a.status === 'skipped').length} skipped · answers stay with this posting</small>}</div>
            <details className="evidence-general"><summary>Additional notes & preferences <small>Optional</small>{w.evidenceNotes.trim() && <small>Saved notes inside</small>}</summary><p className="studio-hint">Use this for general context or writing preferences, such as tone and length. The guided flow handles question-specific evidence. Your existing notes are preserved.</p><Field label="General notes & writing preferences" value={w.evidenceNotes} onChange={evidenceNotes => update({ evidenceNotes })} area rows={5} placeholder="For example: use British English and a concise tone. Add only genuine facts if providing extra context." /></details>
            {w.importSource && <details className="requirement"><summary>Original imported text</summary><pre className="source-text">{w.importSource}</pre></details>}
          </>;
}
