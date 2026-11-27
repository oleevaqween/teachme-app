'use client';
import { useEffect, useState } from 'react';
import type { SessionQuestion } from '@/lib/practice/session';

export type PackProgress = Map<string, { attempts: number; best: number | null }>;

export function practiceBadge(progress?: { attempts: number; best: number | null }): string {
  return progress && progress.attempts > 0 ? `Practised ${progress.attempts}× · best ${progress.best}/10` : 'Not practised yet';
}

/** Read-only practice progress for CV Studio's pack, keyed by pack question key. Null until loaded for this workspace, and when loading failed. */
export function usePackPracticeProgress(workspaceId: string | null, active: boolean): PackProgress | null {
  const [state, setState] = useState<{ workspaceId: string; progress: PackProgress } | null>(null);
  useEffect(() => {
    if (!workspaceId || !active) return;
    let cancelled = false;
    fetch(`/api/practice?application=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' })
      .then(response => (response.ok ? response.json() : null))
      .then((body: { questions?: SessionQuestion[] } | null) => {
        if (cancelled || !body?.questions) return;
        setState({ workspaceId, progress: new Map(body.questions.map(q => [q.key, { attempts: q.progress.attempts, best: q.progress.best }])) });
      })
      .catch(() => { /* Practice progress is optional; the pack works without it. */ });
    return () => { cancelled = true; };
  }, [workspaceId, active]);
  return state && state.workspaceId === workspaceId ? state.progress : null;
}
