'use client';
import { Download, History, Upload } from 'lucide-react';
import { WorkspaceSchema, type Version, type Workspace } from '@/lib/cv-studio/schema';
import { downloadBlob, jsonResponse } from '../useWorkspace';
import type { StudioController } from '../useStudioController';

export function VersionsPanel({ c, w }: { c: StudioController; w: Workspace }) {
  const { run, save, setVersions, versions, change, setNotice, create, setTab } = c;
  return <>
            <div className="panel-intro"><h2>Room to change your mind.</h2><p>Autosave keeps your working draft. Checkpoints preserve decisions and export versions.</p></div>
            <button className="studio-button" onClick={() => void run('Saving checkpoint…', async () => { await save(w, 'Manual checkpoint'); setVersions((await jsonResponse<{ versions: Version[] }>(await fetch('/api/cv-studio/versions?id=' + w.id))).versions); })}><History size={16} /> Save checkpoint</button>
            {versions.map(v => <div className="version-row" key={v.id}><div><strong>{v.label}</strong><small>{new Date(v.createdAt).toLocaleString()}</small></div><button className="studio-button secondary" onClick={() => void run('Restoring version…', async () => { await save(w, 'Before restoring ' + v.label); change(v.workspace); await save(v.workspace, 'Restored ' + v.label); setNotice('Version restored. The previous state is preserved in history.'); })}>Restore</button></div>)}
            <button className="studio-button secondary wide" onClick={() => downloadBlob(new Blob([JSON.stringify(w, null, 2)], { type: 'application/json' }), 'teachme-cv-backup.json')}><Download size={16} /> Download editable backup</button><a className="text-button" href="/api/backup" download>Back up everything (all CVs, applications and practice)</a>
            <div className="backup-import"><label className="file-pick"><Upload size={16} aria-hidden="true" /> Restore a JSON backup as a new copy<input className="sr-only" type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run('Restoring backup…', async () => { const backup = WorkspaceSchema.parse(JSON.parse(await f.text())); await create({ ...backup, id: crypto.randomUUID(), name: backup.name + ' (restored)' }); setTab('profile'); }); }} /></label></div>
          </>;
}
