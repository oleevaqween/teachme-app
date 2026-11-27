'use client';
import { ArrowRight, Check, FileText, Upload } from 'lucide-react';
import { makeWorkspace } from '../useWorkspace';
import type { StudioController } from '../useStudioController';

export function WelcomePanel({ c }: { c: StudioController }) {
  const { busy, state, setImportOpen, setImported, run, create } = c;
  return <div className="studio-empty">
      <div className="empty-symbol"><FileText size={34} /></div><div className="studio-eyebrow">START WITH WHAT YOU KNOW</div><h2>Your next opportunity starts<br />with your own experience.</h2>
      <p>Bring your existing CV or build your career record here. Then paste a job posting to discover the evidence worth highlighting.</p>
      <div><button className="studio-button" disabled={!!busy || !state.loaded} onClick={() => { setImportOpen(true); setImported(null); }}><Upload size={17} /> Bring my CV</button><button className="studio-button secondary" disabled={!!busy || !state.loaded} onClick={() => void run('Creating CV…', async () => { await create(makeWorkspace('Master CV')); })}>Start from scratch <ArrowRight size={17} /></button></div>
      <div className="empty-features"><span><Check size={15} /> Your facts stay yours</span><span><Check size={15} /> Editable Word & PDF</span><span><Check size={15} /> Saved application versions</span></div>
    </div>;
}
