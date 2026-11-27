'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { activeEvidenceGuide, type EvidenceAnswer, type EvidenceAttachment } from '@/lib/cv-studio/evidence-schema';
import { evidenceHelp, guideStartStep, updateEvidenceAnswer } from '@/lib/cv-studio/evidence-guide';
import { limitedAnswer, unfinishedOutline } from '@/lib/cv-studio/answer-intent';
import { answerAlternatives, adoptAnswerAlternative, type AnswerAlternative } from '@/lib/cv-studio/answer-alternatives';
import type { Workspace } from '@/lib/cv-studio/schema';
import { sourceLabel } from '@/lib/cv-studio/plain-labels';
import { jsonResponse } from './useWorkspace';

type Props = { workspace: Workspace; status: string; change: (w: Workspace) => void; save: (w: Workspace, checkpoint?: string) => Promise<void>; close: () => void; refresh: (w: Workspace) => void; startAt?: string };
export function EvidenceGuide({ workspace: w, status, change, save, close, refresh, startAt }: Props) {
  const guide = activeEvidenceGuide(w)!;
  const [step, setStep] = useState(() => guideStartStep(guide, startAt));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [helpFor, setHelpFor] = useState<string | null>(null);
  const [pending, setPending] = useState<(EvidenceAttachment & { originalText: string }) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { request.current?.abort(); previous?.focus(); };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const item = guide.answers[step];
  const answered = guide.answers.filter(a => a.status === 'answered').length;
  const skipped = guide.answers.filter(a => a.status === 'skipped').length;
  const draftCount = guide.answers.length - answered - skipped;
  const help = evidenceHelp(item?.question ?? '');
  const alternatives = item && (limitedAnswer(item.answer) || helpFor === item.id) ? answerAlternatives(w, item) : [];
  function chooseAlternative(alternative: AnswerAlternative) {
    try { change(updateEvidenceAnswer(w, adoptAnswerAlternative(item, alternative))); setConfirmed(false); setHelpFor(null); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare this draft.'); }
  }
  function edit(patch: Partial<EvidenceAnswer>) {
    try {
      const next = updateEvidenceAnswer(w, { ...item, ...patch, status: 'draft' });
      change(next); setConfirmed(false); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'This answer could not be updated.'); }
  }
  function go(index: number) { setStep(index); setConfirmed(false); setHelpFor(null); setError(''); }
  async function perform(label: string, action: () => Promise<void>) {
    setBusy(label); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please retry.'); }
    finally { setBusy(''); }
  }
  function pause() {
    if (busy) return;
    if (pending) { setError('Use or discard the document excerpt before closing. Your saved answers are safe.'); return; }
    void perform('Saving your progress…', async () => { await save(w, 'Guided evidence paused'); close(); });
  }
  function finishAnswer(answerStatus: 'answered' | 'skipped') {
    void perform('Saving this answer…', async () => {
      const next = updateEvidenceAnswer(w, { ...item, status: answerStatus });
      change(next); await save(next, answerStatus === 'answered' ? 'Guided answer confirmed' : 'Guided question skipped'); go(step + 1);
    });
  }
  async function readDocument(file: File) {
    await perform('Reading document locally…', async () => {
      if (file.size > 5 * 1024 * 1024 || !/\.(pdf|docx|txt)$/i.test(file.name)) throw new Error('Choose a PDF, DOCX or TXT file up to 5 MB.');
      const body = new FormData(); body.append('file', file);
      request.current = new AbortController();
      const result = await jsonResponse<{ name: string; text: string }>(await fetch('/api/cv-studio/evidence', { method: 'POST', body, signal: request.current.signal }));
      setPending({ id: crypto.randomUUID(), name: result.name, originalText: result.text, text: result.text.slice(0, 6000) });
    });
  }
  return <dialog ref={dialog} className="evidence-dialog" aria-labelledby="evidence-title" onCancel={event => { event.preventDefault(); pause(); }}>
    <div className="evidence-dialog-head"><div><span className="studio-step">YOUR EXPERIENCE, ONE QUESTION AT A TIME</span><h2 id="evidence-title">Build the missing evidence.</h2></div><button className="icon-button" aria-label="Save progress and close evidence guide" disabled={!!busy} onClick={pause}><X size={21} /></button></div>
    <div className="evidence-progress"><span>{answered} confirmed · {skipped} skipped · {draftCount} unfinished</span><span role="status">{status}</span><progress aria-label="Questions addressed" value={answered + skipped} max={guide.answers.length} /></div>
    <nav className="evidence-steps" aria-label="Evidence questions">{guide.answers.map((a, i) => <button key={a.id} aria-label={'Question ' + (i + 1) + ': ' + a.status} aria-current={step === i ? 'step' : undefined} disabled={!!busy || !!pending} onClick={() => go(i)}>{a.status === 'answered' ? <Check size={14} /> : i + 1}</button>)}<button aria-current={!item ? 'step' : undefined} disabled={!!busy || !!pending} onClick={() => go(guide.answers.length)}>Review</button></nav>
    {error && <div className="studio-alert" role="alert"><span>{error}</span>{!pending && !busy && <button className="text-button" onClick={close}>Return to workspace (keep draft)</button>}</div>}
    {busy && <p className="studio-hint" role="status"><Loader2 size={16} className="spin" /> {busy}</p>}
    <fieldset disabled={!!busy}>
      {item ? <>
        <span className="studio-step">QUESTION {step + 1} OF {guide.answers.length}</span>
        <h3 className="evidence-question" ref={heading} tabIndex={-1}>{item.question}</h3>
        <div className="evidence-coach"><strong>Why this matters</strong><p>{item.why}</p><strong>How to answer</strong><p>{help.prompt}</p></div>
        {item.status !== 'draft' && <p className="studio-hint">This question is {item.status === 'answered' ? 'confirmed' : 'skipped'}. Editing it makes it a draft again until you confirm.</p>}
        <label className="studio-field"><span>Your answer</span><textarea rows={6} maxLength={6000} value={item.answer} onChange={e => edit({ answer: e.target.value })} placeholder="Start with the facts you know. A short, specific answer is enough." /><small>{item.answer.length}/6,000 characters</small></label>
        <button className="text-button" onClick={() => setHelpFor(helpFor === item.id ? null : item.id)}><Sparkles size={14} /> Help me find an answer</button>
        {alternatives.length > 0 && <section className="answer-alternatives" aria-label="Possible answers to review"><h4>You do not have to start from a blank page.</h4><p>A “no” or “not sure” is a useful starting point. Here are possible ways forward, prepared locally from your record and answer outlines. Nothing is added automatically.</p>{alternatives.map(option => <article key={option.id}><strong>{option.title}</strong><small>{option.kind === 'record' ? 'Recorded passage · relevance needs your review' : option.kind === 'outline' ? 'Fill-in outline · not a finished answer' : 'Honest uncertainty · optional'}</small><p>{option.detail}</p><blockquote>{option.draft}</blockquote>{option.source && <small>From: {sourceLabel(option.source, w)}</small>}<button className="studio-button secondary" disabled={!!pending} onClick={() => chooseAlternative(option)}>Use as a draft to review</button></article>)}<p>You can also keep your original reply or skip. A related skill never substitutes for a required certification.</p></section>}
        {item.assistance && <div className="inline-warning"><strong>Suggested draft — review before confirming</strong><p>Your original reply: {item.assistance.originalReply || '(Empty)'}</p><p>{unfinishedOutline(item) ? 'Replace or remove every bracketed prompt with genuine details before confirming.' : 'Check that this wording truly answers the question and accurately describes you. Selecting a draft has not confirmed it or changed your CV.'}</p><button className="text-button" onClick={() => edit({ answer: item.assistance!.originalReply, assistance: undefined })}>Restore my original reply</button></div>}
        <details className="evidence-document-section" open={!!pending || item.attachments.length > 0}><summary><Upload size={16} /> Add supporting evidence <small>Optional</small></summary><p className="studio-hint">{help.documents}</p><p className="studio-hint">PDF, DOCX or TXT · up to 5 MB · 3 excerpts per answer. Extraction stays in this lab. Only your reviewed text is saved; the original file is not retained. Scans/images are not supported—paste the relevant facts instead.</p>
          {item.attachments.map(file => <div className="evidence-file" key={file.id}><details><summary><FileText size={14} /> {file.name}</summary><pre className="source-text">{file.text}</pre></details><button className="text-button" aria-label={'Remove excerpt ' + file.name} disabled={!!pending} onClick={() => edit({ attachments: item.attachments.filter(f => f.id !== file.id) })}>Remove</button></div>)}
          {!pending && item.attachments.length < 3 && <label className="file-pick"><Upload size={16} aria-hidden="true" /> Choose a supporting document<input className="sr-only" type="file" accept=".pdf,.docx,.txt" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void readDocument(file); }} /></label>}
          {pending && <div className="evidence-excerpt"><h4>Review before attaching</h4><p className="studio-hint">Remove confidential details and keep only the relevant passage. Uploading a document does not prove a claim. Confirm below that this evidence is appropriate to your own experience.</p><details><summary>Full extracted text · {pending.name}</summary><pre className="source-text">{pending.originalText}</pre></details>{pending.originalText.length > 6000 && <p className="inline-warning">The editable excerpt starts with the first 6,000 characters. Replace it with the relevant passage from the full text above.</p>}<label className="studio-field"><span>Reviewed excerpt</span><textarea rows={7} maxLength={6000} value={pending.text} onChange={e => setPending({ ...pending, text: e.target.value })} /></label><div className="evidence-actions"><button className="studio-button" disabled={!pending.text.trim()} onClick={() => { try { const next = updateEvidenceAnswer(w, { ...item, status: 'draft', attachments: [...item.attachments, { id: pending.id, name: pending.name, text: pending.text }] }); change(next); setPending(null); setConfirmed(false); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not attach excerpt.'); } }}>Use reviewed excerpt</button><button className="studio-button secondary" onClick={() => setPending(null)}>Discard excerpt</button></div></div>}
        </details>
        <label className="evidence-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> <span>I have checked this answer and any excerpts. They accurately represent my experience, distinguish my contribution from others’, and are appropriate to share with my AI provider.</span></label>
        <p className="studio-hint">Draft and skipped answers are saved for you but excluded from AI evidence. Confirmed answers are sent only when you prepare or refresh an analysis or application pack. No CV wording changes automatically.</p>
        <div className="evidence-actions"><button className="studio-button secondary" disabled={step === 0 || !!pending} onClick={() => go(step - 1)}><ArrowLeft size={15} /> Back</button><button className="text-button" disabled={!!pending} onClick={() => finishAnswer('skipped')}>Skip for now</button><button className="studio-button" disabled={!!pending || !confirmed || unfinishedOutline(item) || (!item.answer.trim() && !item.attachments.length)} onClick={() => finishAnswer('answered')}>Confirm & continue <ArrowRight size={15} /></button></div>
      </> : <>
        <h3 className="evidence-question" ref={heading} tabIndex={-1}>A clearer picture, in your own words.</h3><p className="studio-hint">{answered} confirmed answer{answered === 1 ? '' : 's'} will inform the next analysis. You can leave questions unfinished. Skipping does not mean you lack a skill.</p>
        {guide.answers.map((a, i) => <div className="evidence-review-row" key={a.id}><div><strong>{a.question}</strong><span className={'evidence-badge ' + (a.status === 'answered' ? 'supported' : '')}>{a.status === 'answered' ? 'Confirmed' : a.status === 'skipped' ? 'Skipped' : 'Draft · not used'}</span><p>{a.answer || (a.attachments.length ? 'Reviewed document evidence attached.' : 'No answer recorded.')}</p>{a.attachments.length > 0 && <small>{a.attachments.map(f => f.name).join(' · ')}</small>}</div><button className="text-button" onClick={() => go(i)}>Edit answer {i + 1}</button></div>)}
        <p className="studio-hint">Refreshing sends the current CV, posting, general notes and confirmed answers/excerpts to your configured provider. Your master CV and unaccepted wording stay unchanged.</p><div className="evidence-actions"><button className="studio-button secondary" onClick={pause}>Save & close</button><button className="studio-button" onClick={() => void perform('Saving your evidence…', async () => { await save(w, 'Guided evidence reviewed'); close(); refresh(w); })}><Sparkles size={16} /> Save & refresh analysis</button></div>
      </>}
    </fieldset>
    {item && <button className="text-button evidence-pause" disabled={!!busy || !!pending} onClick={pause}>Pause & save for later</button>}
  </dialog>;
}
