import type { Workspace } from '@/lib/cv-studio/schema';
import { practiceClaimUrl } from '@/lib/practice/claims';

/** Saves any unsaved edits, then opens Mock Interview on one bullet so the server sees the same wording; a failed save stays on the page. */
export async function saveThenPractise(w: Workspace, target: string, bullet: string, deps: { save: (w: Workspace) => Promise<void>; go: (url: string) => void }): Promise<void> {
  await deps.save(w);
  deps.go(practiceClaimUrl(w.id, target, bullet));
}
