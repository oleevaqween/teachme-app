'use client';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import { Field } from '../ResumeEditor';
import type { StudioController } from '../useStudioController';

export function TargetRolePanel({ c, w }: { c: StudioController; w: Workspace }) {
  const { update, prepare } = c;
  return <>
            <div className="panel-intro"><span className="studio-step">01 / UNDERSTAND THE OPPORTUNITY</span><h2>Paste the role. Find your angle.</h2><p>Copy the full posting from LinkedIn or anywhere else. Include the company, responsibilities and qualifications.</p></div>
            <Field label="Job description" value={w.jobDescription} onChange={jobDescription => update({ jobDescription })} area rows={14} placeholder="Paste the job posting here…" />
            <p className="studio-hint">Preparing uses the AI provider configured in this lab. Your CV and posting are sent to that provider. Your master CV remains intact.</p>
            <button className="studio-button wide" disabled={w.jobDescription.trim().length < 60 || !w.resume.personal.fullName.trim()} onClick={() => void prepare('analyze')}><Sparkles size={18} /> Tailor my CV to this job <ArrowRight size={17} /></button>
            <p className="studio-hint">You will get a job-match estimate and a reviewed draft covering your summary, skills and experience. Preview the changes, then apply them together or individually. Nothing silently replaces your CV.</p>
            {!w.resume.personal.fullName.trim() && <p className="studio-hint">Start by adding your name and career evidence in Profile.</p>}
          </>;
}
