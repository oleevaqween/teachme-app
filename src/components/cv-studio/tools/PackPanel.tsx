'use client';
import Link from 'next/link';
import { ArrowRight, BookOpen, Check, Download, Sparkles } from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import { Field } from '../ResumeEditor';
import { packQuestionKey } from '@/lib/practice/question-key';
import { practiceBadge } from '@/components/practice/usePackPracticeProgress';
import { startLearning } from '../start-learning';
import { letterOpeningLabels, letterToneLabels } from '@/lib/cv-studio/career-writing';
import { sourceLabel } from '@/lib/cv-studio/plain-labels';
import { letterParagraphs, letterSpecificity } from '@/lib/cv-studio/cover-letter';
import { rewriteBelongs } from '@/lib/cv-studio/letter-rewrite';
import { LETTER_WORTH_IT, ParagraphRewriter, SpecificityList } from './LetterParts';
import type { StudioController } from '../useStudioController';

export function PackPanel({ c, w }: { c: StudioController; w: Workspace }) {
  const { update, pending, freshPackage, prepare, run, change, save, exportFile, practice } = c;
  return <>
            <div className="panel-intro"><span className="studio-step">03 / MAKE IT COUNT</span><h2>Ready for the conversation.</h2><p>A letter that explains your fit for this employer through selected examples, not a repeat of your CV. Includes interview practice from your recorded experience.</p></div>
            <Field label="Your angle for this letter (optional)" area rows={3} value={w.letterBrief ?? ''} placeholder="What genuinely interests you about this role? Is there a relevant example or career-change reason you want to explain? Leave blank and we will focus on your professional fit." onChange={letterBrief => update({ letterBrief: letterBrief.slice(0, 3000) })} />
            <Field label="About the employer (optional)" area rows={4} value={w.companyNotes ?? ''}
              placeholder="Paste their About page, mission or a recent announcement. The letter will only mention the employer using this text or the job advert."
              onChange={companyNotes => update({ companyNotes: companyNotes.slice(0, 6000) })} />
            <div className="field-grid">
              <label className="studio-field"><span>Letter voice</span><select value={w.letterTone ?? 'direct'} onChange={e => update({ letterTone: e.target.value as Workspace['letterTone'] })}>{Object.entries(letterToneLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="studio-field"><span>Opening approach</span><select value={w.letterOpening ?? 'employer-led'} onChange={e => update({ letterOpening: e.target.value as Workspace['letterOpening'] })}>{Object.entries(letterOpeningLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </div>
            <p className="studio-hint">Draft → writing edit → evidence check. The letter should make a case for hiring you, not walk through your career history. Change the voice or opening and regenerate to try a different approach.</p>
            <p className="studio-hint">Only include true details. This context helps shape the letter; it does not edit your CV. A strong letter has a specific opening, one or two relevant examples, and a concise closing.</p>
            <button className="studio-button wide" disabled={w.jobDescription.trim().length < 60} onClick={() => void prepare('package')}><Sparkles size={17} /> {w.package ? 'Regenerate application pack' : 'Prepare letter & interview practice'}</button>
            {pending > 0 && <p className="studio-hint">{pending} suggestions are still pending. The pack uses your current CV, not unaccepted edits.</p>}
            {w.package && <>
              {!freshPackage && <div className="inline-warning">Your CV, evidence or posting has changed. Regenerate this pack before exporting.</div>}
              <h3 className="subheading">Your cover letter</h3>
              <p className="studio-hint">{LETTER_WORTH_IT}</p>
              {w.package.letterNotice && <div className="inline-warning">{w.package.letterNotice.includes('source-only starter') ? 'This saved letter is a CV-extract starter from the older generator. Regenerate the application pack to request a narrative cover letter. Your saved text stays unchanged until then.' : w.package.letterNotice}</div>}
              {!!w.package.letterIssues?.length && <details className="requirement"><summary>What needs attention?</summary><ul>{w.package.letterIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul><p>These checks refer to the attempted new draft, not any previous letter kept below.</p></details>}
              {!!w.package.letterWarnings?.length && <details className="requirement"><summary>Writing suggestions · not an evidence failure</summary><p>This new letter passed the automated factual checks. These are optional editorial improvements; please still review every fact yourself.</p><ul>{w.package.letterWarnings.map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}
              <Field label="Review and edit the letter" area rows={18} value={w.package.coverLetter} onChange={coverLetter => update({ package: { ...w.package!, coverLetter, coverLetterApproved: false, letterStatus: 'draft', letterNotice: undefined, letterIssues: undefined, letterWarnings: undefined, auditedLetter: undefined, letterReview: undefined } })} />
              {w.package.coverLetter.trim() && <SpecificityList result={letterSpecificity(w.package.coverLetter, w)} />}
              {w.package.coverLetter.trim() && <>
                <h4 className="subheading">Rewrite one paragraph</h4>
                {!freshPackage && <p className="studio-hint">Regenerate the application pack before rewriting a paragraph.</p>}
                <ParagraphRewriter paragraphs={letterParagraphs(w.package.coverLetter)} busy={!!c.busy} disabled={!freshPackage}
                  pending={c.rewrite && rewriteBelongs(w, c.rewrite) ? { index: c.rewrite.index, result: c.rewrite.result } : null}
                  onRewrite={(index, instruction) => void c.askRewrite(index, instruction)} onUse={c.applyRewrite} onKeep={c.keepMine} />
              </>}
              <p className="studio-hint">{w.package.coverLetter.trim() ? w.package.coverLetter.trim().split(/\s+/).length : 0} words · Aim for one page. The final page count depends on your selected design and font size.</p>
              <p className="studio-hint">Verify every factual statement, including duties, qualifications, intentions and availability. Automated checks are not proof of accuracy. Editing the letter clears your approval.</p>
              {w.package.letterReview && w.package.auditedLetter === w.package.coverLetter && <details className="requirement"><summary>Inspect the paragraph evidence check</summary>{w.package.letterReview.map(item => <div key={item.index}><strong>Paragraph {item.index + 1}</strong>{item.evidence.length ? item.evidence.map((e, i) => <blockquote key={i}>{sourceLabel(e.source, w)}<br />{e.quote}</blockquote>) : <p>Greeting, closing or general application wording.</p>}</div>)}</details>}
              {!w.package.coverLetterApproved && <button className="studio-button wide" disabled={!freshPackage || !w.package.coverLetter.trim()} onClick={() => void run('Saving letter approval…', async () => { const next = { ...w, package: { ...w.package!, coverLetterApproved: true } }; change(next); await save(next, 'Cover letter reviewed and approved'); })}><Check size={16} /> I reviewed the facts — approve letter</button>}
              <div className="export-buttons"><button className="studio-button secondary" disabled={!freshPackage || !w.package.coverLetterApproved} onClick={() => void exportFile('docx','letter')}><Download size={15} /> Word letter</button><button className="studio-button secondary" disabled={!freshPackage || !w.package.coverLetterApproved} onClick={() => void exportFile('pdf','letter')}>PDF letter</button></div>
              <h3 className="subheading">Prepare for the questions</h3>{!!w.package.guidanceWarnings?.length && <details className="requirement"><summary>Writing suggestions for the guidance</summary><ul>{w.package.guidanceWarnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}{w.kind === 'application' && <p><Link className="text-button" href={`/interview/practice/${encodeURIComponent(w.id)}`}>Practise these questions with feedback in Mock Interview</Link></p>}{w.package.interview.map((q, i) => <details className="interview-question" key={i}><summary>{i + 1}. {q.question} <small style={{ marginLeft: 8, opacity: 0.7 }}>{w.kind === 'application' && practice && practiceBadge(practice.get(packQuestionKey(q.question)))}</small></summary><p>{q.guidance}</p><small>Draw on: {q.evidence.map(source => sourceLabel(source, w)).join('; ') || 'Reflect on a genuine example; none recorded yet.'}</small><Field label={'Your practice answer ' + (i + 1)} area rows={6} value={q.practiceAnswer ?? ''} placeholder="Use a real situation, your actions, and the outcome. These notes are saved with this application." onChange={practiceAnswer => update({ package: { ...w.package!, interview: w.package!.interview.map((entry, index) => index === i ? { ...entry, practiceAnswer } : entry) } })} /></details>)}
              <h3 className="subheading">Build the missing evidence</h3>{w.package.learningPriorities.map((p, i) => <div className="learning-card" key={i}><BookOpen size={18} /><div><h4>{p.topic}</h4><p>{p.exercise}</p><Link href="/teach-me" onClick={() => startLearning({ topic: p.topic, exercise: p.exercise, role: w.analysis?.role ?? '', company: w.analysis?.company ?? '', applicationId: w.id })}>Explore in Teach Me <ArrowRight size={14} /></Link></div></div>)}
              <p className="studio-hint">Learning and practice do not become claimed employment or certification.</p>
            </>}
          </>;
}
