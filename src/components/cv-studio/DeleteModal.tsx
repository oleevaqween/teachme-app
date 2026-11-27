'use client';
import { Download, Trash2, X } from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import { downloadBlob } from './useWorkspace';
import type { StudioController } from './useStudioController';

export function DeleteModal({ c, target }: { c: StudioController; target: Workspace }) {
  const { busy, setDeleteTarget, run, removeApplication, setVersions, setTab, setNotice } = c;
  return <div className="studio-modal-backdrop"><section className="studio-modal delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="modal-head"><h2 id="delete-title">Delete this application?</h2><button className="icon-button" aria-label="Close delete confirmation" disabled={!!busy} onClick={() => setDeleteTarget(null)}><X size={21} /></button></div>
      <p><strong>{target.name}</strong> and all of its saved checkpoints will be permanently removed from this device. Its master CV and every other application will remain unchanged.</p>
      <p className="studio-hint">Download a backup first if you may want to restore this application later.</p>
      <div className="delete-actions"><button className="studio-button secondary" disabled={!!busy} onClick={() => downloadBlob(new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' }), 'teachme-application-backup.json')}><Download size={16} /> Download backup</button><button className="studio-button secondary" disabled={!!busy} onClick={() => setDeleteTarget(null)}>Keep application</button><button className="studio-button danger" disabled={!!busy} onClick={() => void run('Deleting application…', async () => { const result = await removeApplication(target); setDeleteTarget(null); setVersions([]); setTab('profile'); setNotice(`Application deleted with ${result.removedVersions} saved checkpoint${result.removedVersions === 1 ? '' : 's'}. Your master CV is unchanged.`); })}><Trash2 size={16} /> Delete application</button></div>
    </section></div>;
}
