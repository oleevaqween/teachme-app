'use client';
import Link from 'next/link';
import { Check, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { ResumeEditor, Field } from './ResumeEditor';
import { ImportCheck } from './ImportCheck';
import { makeWorkspace } from './useWorkspace';
import type { StudioController } from './useStudioController';

export function ImportModal({ c }: { c: StudioController }) {
  const { setImportOpen, imported, busy, aiBusy, abort, error, setImported, run, create, setTab, importFile, setImportFile, importText, setImportText, importCV } = c;
  return <div className="studio-modal-backdrop"><section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-head"><h2 id="import-title">{imported ? 'Review the imported record' : 'Bring your experience with you'}</h2><button className="icon-button" aria-label="Close import" disabled={!!busy} onClick={() => setImportOpen(false)}><X size={21} /></button></div>
      {busy && <p role="status"><Loader2 className="spin" size={18} /> {busy} {aiBusy && <button className="text-button" onClick={() => abort.current?.abort()}>Cancel request</button>}</p>}
      {error && <p className="inline-warning" role="alert">{error}</p>}
      {imported ? <><p>Check the fields against the source. Import creates a new master CV and never overwrites an existing one.</p><ImportCheck diagnosis={imported.diagnosis} sourceText={imported.sourceText} resume={imported.resume} /><details><summary>Original extracted text</summary><pre className="source-text">{imported.sourceText}</pre></details><fieldset disabled={!!busy}><ResumeEditor resume={imported.resume} change={resume => setImported({ ...imported, resume })} /></fieldset><button className="studio-button wide" disabled={!!busy} onClick={() => void run('Saving reviewed import…', async () => { await create({ ...makeWorkspace(imported.resume.personal.fullName + ' · Master CV'), resume: imported.resume, importSource: imported.sourceText }); setImported(null); setImportOpen(false); setTab('profile'); })}><Check size={17} /> Save reviewed master CV</button></> : <>
        <p>Upload a PDF or Word CV, or paste the text. You will review the extracted information before it is saved.</p>
        <label className="upload-zone"><Upload size={28} /><strong>{importFile?.name || 'Choose a PDF or DOCX'}</strong><span>Up to 5 MB · Text-based documents</span><input type="file" accept=".pdf,.docx" onChange={e => setImportFile(e.target.files?.[0] ?? null)} /></label>
        {importFile ? <button className="text-button" onClick={() => setImportFile(null)}>Use pasted text instead</button> : <Field label="Or paste your existing CV" area rows={9} value={importText} onChange={setImportText} />}
        <p className="studio-hint">Import sends the CV to your configured AI provider for extraction. Configure the lab provider in <Link href="/settings">Settings</Link>.</p>
        <button className="studio-button wide" disabled={!!busy || (!importFile && importText.trim().length < 40)} onClick={() => void importCV()}><Sparkles size={17} /> Extract for review</button>
      </>}
    </section></div>;
}
