'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Check, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { IMPORT_ACCEPT, importFileProblem } from '@/lib/cv-studio/import-file';
import { ResumeEditor, Field } from './ResumeEditor';
import { ImportCheck } from './ImportCheck';
import { makeWorkspace } from './useWorkspace';
import type { StudioController } from './useStudioController';

export function ImportModal({ c }: { c: StudioController }) {
  const { setImportOpen, imported, busy, aiBusy, abort, error, setImported, run, create, setTab, importFile, setImportFile, importText, setImportText, importCV } = c;
  const [dragging, setDragging] = useState(false);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const takeFile = (file: File | undefined) => {
    if (!file) return;
    const problem = importFileProblem(file.name);
    setFileProblem(problem);
    if (!problem) setImportFile(file);
  };
  return <div className="studio-modal-backdrop"><section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-head"><h2 id="import-title">{imported ? 'Review the imported record' : 'Bring your experience with you'}</h2><button className="icon-button" aria-label="Close import" disabled={!!busy} onClick={() => setImportOpen(false)}><X size={21} /></button></div>
      {busy && <p role="status"><Loader2 className="spin" size={18} /> {busy} {aiBusy && <button className="text-button" onClick={() => abort.current?.abort()}>Cancel request</button>}</p>}
      {error && <p className="inline-warning" role="alert">{error}</p>}
      {imported ? <><p>Check the fields against the source. Import creates a new master CV and never overwrites an existing one.</p><ImportCheck diagnosis={imported.diagnosis} sourceText={imported.sourceText} resume={imported.resume} /><details><summary>Original extracted text</summary><pre className="source-text">{imported.sourceText}</pre></details><fieldset disabled={!!busy}><ResumeEditor resume={imported.resume} change={resume => setImported({ ...imported, resume })} /></fieldset><button className="studio-button wide" disabled={!!busy} onClick={() => void run('Saving reviewed import…', async () => { await create({ ...makeWorkspace(imported.resume.personal.fullName + ' · Master CV'), resume: imported.resume, importSource: imported.sourceText }); setImported(null); setImportOpen(false); setTab('profile'); })}><Check size={17} /> Save reviewed master CV</button></> : <>
        <p>Upload a PDF or Word CV, or paste the text. You will review the extracted information before it is saved.</p>
        {/* The browser's own picker ("Choose File / No file chosen") is hidden; the whole box opens it, and a file can be dropped on it. */}
        <label className={'upload-zone' + (dragging ? ' dragging' : '')}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) takeFile(e.dataTransfer.files?.[0]); }}>
          <Upload size={28} aria-hidden="true" />
          <strong>{importFile?.name || 'Choose a PDF or DOCX'}</strong>
          <span>Drop it here or browse · Up to 5 MB · Text-based documents</span>
          <span className="upload-browse" aria-hidden="true">{importFile ? 'Choose a different file' : 'Browse files'}</span>
          <input className="sr-only" type="file" accept={IMPORT_ACCEPT} disabled={!!busy} onChange={e => { takeFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {fileProblem && <p className="inline-warning" role="alert">{fileProblem}</p>}
        {importFile ? <button className="text-button" onClick={() => setImportFile(null)}>Use pasted text instead</button> : <Field label="Or paste your existing CV" area rows={9} value={importText} onChange={setImportText} />}
        <p className="studio-hint">Import sends the CV to your configured AI provider for extraction. Configure the lab provider in <Link href="/settings">Settings</Link>.</p>
        <button className="studio-button wide" disabled={!!busy || (!importFile && importText.trim().length < 40)} onClick={() => void importCV()}><Sparkles size={17} /> Extract for review</button>
      </>}
    </section></div>;
}
