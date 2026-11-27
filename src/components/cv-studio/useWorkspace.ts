'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkspaceSchema, defaultLayout, emptyResume, type Workspace, type SavedWorkspace } from '@/lib/cv-studio/schema';
import { pickInitialWorkspace, saveFailureKind } from '@/lib/cv-studio/workspace-rules';

export function makeWorkspace(name: string, kind: Workspace['kind'] = 'master', parent?: Workspace): Workspace {
  return { id: crypto.randomUUID(), name, kind, parentId: parent?.id ?? null,
    resume: parent ? structuredClone(parent.resume) : emptyResume(),
    layout: parent ? structuredClone(parent.layout) : structuredClone(defaultLayout),
    jobDescription: '', evidenceNotes: parent?.evidenceNotes ?? '',
    importSource: parent?.importSource,
    // Absent unless the parent has them, so new CVs store exactly what they did before.
    ...(parent?.spelling ? { spelling: parent.spelling } : {}),
    ...(parent?.market ? { market: parent.market } : {}),
    ...(parent?.ownWords?.length ? { ownWords: [...parent.ownWords] } : {}),
    analysis: null, analysisInput: null, package: null, packageInput: null };
}
/** A failed API request; `status` lets callers tell conflicts from transient failures. */
export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'RequestError'; }
}
export async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(data.error || 'The request failed.', response.status);
  return data as T;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function useWorkspace() {
  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState('Loading workspace…');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<Workspace[]>([]);
  const [recovery, setRecovery] = useState<Workspace | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const saveErrorShown = useRef(false);
  const current = useRef<Workspace | null>(null);
  const revisions = useRef<Record<string, number>>({});
  const queue = useRef<Promise<void>>(Promise.resolve());
  const persisted = useRef<Record<string, string>>({});
  const paused = useRef(false);
  const deleting = useRef<string | null>(null);
  const change = useCallback((w: Workspace) => {
    const old = current.current;
    if (old?.id === w.id) setHistory(h => [...h.slice(-39), old]);
    else setHistory([]);
    current.current = w; setWorkspace(w); setStatus('Unsaved changes');
    try { localStorage.setItem('teachme-cv-recovery', JSON.stringify(w)); } catch { /* Server save remains available. */ }
  }, []);
  const save = useCallback(async (w: Workspace, checkpoint?: string) => {
    if (deleting.current === w.id) return;
    if (paused.current) throw new Error('Resolve the save error before continuing. Download a recovery copy first.');
    const valid = WorkspaceSchema.safeParse(w);
    if (!valid.success) {
      const issue = valid.error.issues[0];
      setStatus('Check CV fields');
      throw new Error('Check ' + issue.path.join(' / ') + ': ' + issue.message);
    }
    let failed: unknown;
    const task = queue.current.then(async () => {
      if (deleting.current === w.id) return;
      if (paused.current) throw new Error('Saving is paused to protect conflicting changes.');
      if (!checkpoint && persisted.current[w.id] === JSON.stringify(valid.data)) return;
      setStatus('Saving…');
      const result = await jsonResponse<SavedWorkspace>(await fetch('/api/cv-studio', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: valid.data, revision: revisions.current[w.id] ?? 0, checkpoint }),
      }));
      revisions.current[w.id] = result.revision;
      persisted.current[w.id] = JSON.stringify(WorkspaceSchema.parse(result));
      setWorkspaces(items => [result, ...items.filter(x => x.id !== result.id)]);
      const latest = WorkspaceSchema.safeParse(current.current);
      if (latest.success && JSON.stringify(latest.data) === persisted.current[w.id]) {
        setStatus('All changes saved');
        try { localStorage.removeItem('teachme-cv-recovery'); } catch {}
      }
      if (saveErrorShown.current) { saveErrorShown.current = false; setError(''); }
    });
    queue.current = task.catch(e => {
      failed = e;
      const message = e instanceof Error ? e.message : 'The save failed.';
      const kind = saveFailureKind(e);
      if (kind === 'conflict') {
        // Only a real edit conflict pauses saving, so another tab's work is never overwritten.
        paused.current = true; setStatus('Save needs attention'); setError(message);
        return;
      }
      saveErrorShown.current = true;
      if (kind === 'retry') {
        setStatus('Not saved yet · retrying');
        setError('Your latest changes are not saved yet (' + message + '). They are kept in this browser and saving will retry automatically.');
        setTimeout(() => setRetryTick(t => t + 1), 5000);
      } else {
        setStatus('Not saved · see message');
        setError('Your latest changes could not be saved: ' + message);
      }
    });
    await queue.current;
    if (failed) throw failed;
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/cv-studio').then(jsonResponse<{ workspaces: SavedWorkspace[]; unreadable?: number }>).then(data => {
      if (cancelled) return;
      setWorkspaces(data.workspaces);
      if (data.unreadable) setError(`${data.unreadable} saved CV${data.unreadable === 1 ? '' : 's'} could not be opened and ${data.unreadable === 1 ? 'is' : 'are'} hidden for now. Nothing was deleted; ${data.unreadable === 1 ? 'it is' : 'they are'} still stored in career.db.`);
      for (const w of data.workspaces) {
        revisions.current[w.id] = w.revision;
        persisted.current[w.id] = JSON.stringify(WorkspaceSchema.parse(w));
      }
      const initial = pickInitialWorkspace(data.workspaces, window.location.search);
      const first = initial ? WorkspaceSchema.parse(initial) : null;
      current.current = first; setWorkspace(first); setStatus(first ? 'All changes saved' : 'Ready when you are');
      try {
        const raw = localStorage.getItem('teachme-cv-recovery');
        if (raw) {
          const recovered = WorkspaceSchema.parse(JSON.parse(raw));
          if (JSON.stringify(recovered) !== persisted.current[recovered.id]) setRecovery(recovered);
        }
      } catch { setError('A browser recovery record could not be read. Your saved CVs are unaffected.'); }
      setLoaded(true);
    }).catch(e => { if (!cancelled) { setError(e.message); setStatus('Could not load saved CVs'); } });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!workspace || !loaded || paused.current) return;
    const timer = setTimeout(() => { void save(workspace).catch(() => {}); }, 900);
    return () => clearTimeout(timer);
  }, [workspace, loaded, save, retryTick]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      const w = current.current;
      const latest = WorkspaceSchema.safeParse(w);
      if (w && (!latest.success || JSON.stringify(latest.data) !== persisted.current[w.id])) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, []);
  useEffect(() => {
    // A page restored from the back/forward cache holds a stale revision (evidence may have been saved elsewhere), so reload it.
    const reloadIfRestored = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pageshow', reloadIfRestored);
    return () => window.removeEventListener('pageshow', reloadIfRestored);
  }, []);
  async function select(w: Workspace) {
    if (current.current) await save(current.current);
    change(WorkspaceSchema.parse(w));
    setStatus('All changes saved');
  }
  async function create(w: Workspace) {
    if (current.current) await save(current.current);
    change(w); await save(w, 'Created');
  }
  async function removeApplication(w: Workspace) {
    if (w.kind !== 'application') throw new Error('Master CVs are protected and cannot be deleted.');
    await save(w);
    deleting.current = w.id;
    try {
      await queue.current;
      const result = await jsonResponse<{ id: string; removedVersions: number }>(await fetch('/api/cv-studio', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: w.id, revision: revisions.current[w.id] ?? 0 }),
      }));
      const remaining = workspaces.filter(item => item.id !== w.id);
      const selected = remaining.find(item => item.id === w.parentId) ?? remaining.find(item => item.kind === 'master') ?? remaining[0];
      const next = selected ? WorkspaceSchema.parse(selected) : null;
      delete revisions.current[w.id]; delete persisted.current[w.id];
      setWorkspaces(remaining); current.current = next; setWorkspace(next); setHistory([]);
      setStatus(next ? 'All changes saved' : 'Ready when you are');
      setRecovery(item => item?.id === w.id ? null : item);
      try { localStorage.removeItem('teachme-cv-recovery'); } catch {}
      return result;
    } finally { deleting.current = null; }
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(h => h.slice(0, -1)); current.current = previous; setWorkspace(previous); setStatus('Unsaved changes');
    try { localStorage.setItem('teachme-cv-recovery', JSON.stringify(previous)); } catch {}
  }
  return { workspaces, workspace, change, save, select, create, removeApplication, undo, canUndo: history.length > 0,
    error, setError, status, loaded, recovery, clearRecovery: () => setRecovery(null) };
}
