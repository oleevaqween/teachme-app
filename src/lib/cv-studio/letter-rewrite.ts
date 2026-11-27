import type { ParagraphRewrite } from './ai';
import type { ApplicationPackage, Workspace } from './schema';

export const LETTER_CHANGED = 'Your letter changed while this was being written. Rewrite the paragraph again.';

/** What the letter looked like when a paragraph rewrite was requested. */
export type SentRewrite = { workspaceId: string; packageInput: string | null; sent: string };

/** Whether a rewrite still belongs to the letter on screen: same CV, same pack inputs and the same letter text. */
export function rewriteBelongs(w: Workspace, rewrite: SentRewrite): boolean {
  return w.id === rewrite.workspaceId && w.packageInput === rewrite.packageInput && w.package?.coverLetter === rewrite.sent;
}

/**
 * The package with a checked paragraph rewrite applied. The letter needs approval again;
 * old notices and issues are cleared and the rewrite's own writing advice replaces any earlier advice.
 * Refuses when the letter changed after the rewrite was requested.
 */
export function applyParagraphRewrite(
  w: Workspace,
  rewrite: SentRewrite & { result: Extract<ParagraphRewrite, { ok: true }> },
): { package: ApplicationPackage } | { error: string } {
  if (!w.package || !rewrite.result.ok || !rewriteBelongs(w, rewrite)) return { error: LETTER_CHANGED };
  const { coverLetter, letterReview, letterWarnings } = rewrite.result;
  const next: ApplicationPackage = { ...w.package, coverLetter, auditedLetter: coverLetter, letterReview, coverLetterApproved: false, letterStatus: 'draft' };
  delete next.letterNotice;
  delete next.letterIssues;
  if (letterWarnings?.length) next.letterWarnings = letterWarnings; else delete next.letterWarnings;
  return { package: next };
}
