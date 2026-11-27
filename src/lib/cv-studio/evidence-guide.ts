import { EvidenceGuidesSchema, MAX_GUIDE_QUESTIONS, activeEvidenceGuide, type EvidenceAnswer, type EvidenceGuide } from './evidence-schema';
import type { Workspace } from './schema';

export const POSTING_CHANGED = 'The posting changed. Refresh the analysis before answering questions for this role. Previous answers are still saved with their original posting.';

/**
 * The guide for the current posting, with any new analysis questions added as drafts; nothing else is changed. Existing
 * questions are always kept and new ones stop at the 32-question limit. Throws when the posting changed since the analysis.
 */
export function seedEvidenceGuide(w: Workspace): EvidenceGuide {
  if (w.analysisInput && JSON.parse(w.analysisInput)[1] !== w.jobDescription) throw new Error(POSTING_CHANGED);
  const existing = activeEvidenceGuide(w);
  const answers = [...(existing?.answers ?? [])];
  for (const q of w.analysis?.questions ?? []) {
    if (answers.length >= MAX_GUIDE_QUESTIONS) break;
    if (!answers.some(a => a.question === q.question)) answers.push({ id: crypto.randomUUID(), ...q, answer: '', status: 'draft', attachments: [] });
  }
  return { ...existing, id: existing?.id ?? crypto.randomUUID(), jobDescription: w.jobDescription, answers };
}

export function ensureEvidenceGuide(w: Workspace): Workspace {
  const guide = seedEvidenceGuide(w);
  if (!guide.answers.length) throw new Error('Prepare your application first. Follow-up questions will appear here when more detail is needed.');
  return replaceEvidenceGuide(w, guide);
}

/** The step the guide opens on: the given question when it exists, otherwise the first draft, otherwise the review step. */
export function guideStartStep(guide: EvidenceGuide, startAt?: string): number {
  const wanted = startAt ? guide.answers.findIndex(a => a.id === startAt) : -1;
  if (wanted >= 0) return wanted;
  const first = guide.answers.findIndex(a => a.status === 'draft');
  return first < 0 ? guide.answers.length : first;
}
export function replaceEvidenceGuide(w: Workspace, guide: EvidenceGuide): Workspace {
  return { ...w, evidenceGuides: EvidenceGuidesSchema.parse([...(w.evidenceGuides ?? []).filter(g => g.id !== guide.id), guide]) };
}
export function updateEvidenceAnswer(w: Workspace, answer: EvidenceAnswer): Workspace {
  const guide = activeEvidenceGuide(w);
  if (!guide || !guide.answers.some(a => a.id === answer.id)) throw new Error('This question no longer belongs to the active posting. Reopen the guide.');
  return replaceEvidenceGuide(w, { ...guide, answers: guide.answers.map(a => a.id === answer.id ? answer : a) });
}
export function evidenceHelp(question: string): { prompt: string; documents: string } {
  if (/certif|credential|licen[cs]|qualification|degree|pmp\b/i.test(question)) return {
    prompt: 'Give the exact qualification, issuing body and date or current status. Distinguish completed qualifications from study in progress.',
    documents: 'A certificate, transcript or credential record with readable text. Redact private identifiers.',
  };
  if (/tool|software|platform|power bi|excel|sql|system/i.test(question)) return {
    prompt: 'Name the tool, the project or employer, what you personally used it for, and a real deliverable. Distinguish work experience from training.',
    documents: 'A redacted project summary, portfolio write-up or training record. Explain your own contribution.',
  };
  return {
    prompt: 'Describe one real example: where and when, your responsibility, the actions you took, and the outcome. Include a number only if you can substantiate it.',
    documents: 'A redacted project summary, performance review, report excerpt or certificate relevant to this question. Documents are optional.',
  };
}
