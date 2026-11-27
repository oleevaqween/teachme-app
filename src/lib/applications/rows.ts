import type { Market, SavedWorkspace } from '@/lib/cv-studio/schema';
import { blankApplicationInput, toInput, type ApplicationInput, type SavedApplication } from './schema';

export type CvOption = { id: string; name: string; market?: Market };

export type ApplicationRow = {
  /** Entry id, or "cv:<workspaceId>" for a CV Studio application not yet tracked. */
  key: string;
  entry: SavedApplication | null;
  draft: ApplicationInput;
  workspaceId: string | null;
  cvName: string | null;
  cvMissing: boolean;
  virtual: boolean;
  updatedAt: string;
  /** The linked CV's market, which orders the screening questions; absent when it has none. */
  market?: Market;
};

const marketOf = (w: SavedWorkspace | undefined): { market?: Market } => (w?.market ? { market: w.market } : {});

/**
 * Combines saved tracker entries with CV Studio applications. Untracked CV
 * Studio applications become virtual rows; nothing is written until the user saves.
 */
export function buildRows(entries: SavedApplication[], workspaces: SavedWorkspace[]): { rows: ApplicationRow[]; cvOptions: CvOption[] } {
  const applicationCvs = workspaces.filter(w => w.kind === 'application');
  const byId = new Map(applicationCvs.map(w => [w.id, w]));
  const linked = new Set(entries.map(e => e.workspaceId).filter((id): id is string => !!id));

  const saved: ApplicationRow[] = entries.map(entry => {
    const cv = entry.workspaceId ? byId.get(entry.workspaceId) : undefined;
    return {
      key: entry.id, entry, draft: toInput(entry), workspaceId: entry.workspaceId,
      cvName: cv?.name ?? null, cvMissing: !!entry.workspaceId && !cv, virtual: false, updatedAt: entry.updatedAt,
      ...marketOf(cv),
    };
  });

  const untracked = applicationCvs.filter(w => !linked.has(w.id));
  const virtual: ApplicationRow[] = untracked.map(w => ({
    key: 'cv:' + w.id,
    entry: null,
    draft: blankApplicationInput({
      workspaceId: w.id,
      company: w.analysis?.company.trim() ?? '',
      role: (w.analysis?.role.trim() || w.name).slice(0, 300),
      status: 'preparing',
    }),
    workspaceId: w.id, cvName: w.name, cvMissing: false, virtual: true, updatedAt: w.updatedAt,
    ...marketOf(w),
  }));

  return { rows: [...saved, ...virtual], cvOptions: untracked.map(w => ({ id: w.id, name: w.name, ...marketOf(w) })) };
}
