import { sourceLabel } from '@/lib/cv-studio/plain-labels';
import { evidenceCatalog, inputSignature, type Workspace } from '@/lib/cv-studio/schema';
import { normalizeQuestion } from '@/lib/cv-studio/workspace-rules';
import { extraQuestionKey, packQuestionKey } from './question-key';
import type { ClaimTarget } from './claims';
import type { Attempt, GeneratedQuestion, PracticeQuestion, StoredKind } from './schema';

export type QuestionProgress = { attempts: number; best: number | null; latest: number | null };
export type SessionQuestion = {
  key: string; text: string; guidance: string; source: 'pack' | 'extra' | 'claim'; kind: StoredKind | null; evidence: string[];
  claim: ClaimTarget | null; progress: QuestionProgress;
};
export type SessionApplication = { id: string; name: string; kind: 'master' | 'application'; role: string; company: string; hasPosting: boolean; packStale: boolean };
export type PracticeSummary = { practised: number; total: number; average: number | null };

export const QUESTION_GONE = 'This question is no longer part of the application. Reload the page.';
export const FOLLOW_UP_INVALID = 'Follow-ups can only answer a main question you have already answered.';

/** A master CV has no job: its role is the professional title, and it has no posting or pack. */
export function applicationInfo(w: Workspace): SessionApplication {
  const master = w.kind === 'master';
  return {
    id: w.id,
    name: w.name,
    kind: w.kind,
    role: master ? w.resume.personal.professionalTitle.trim() || w.name : w.analysis?.role.trim() || w.name,
    company: master ? '' : w.analysis?.company.trim() ?? '',
    hasPosting: !master && w.jobDescription.trim().length > 0,
    packStale: !master && !!w.package && w.packageInput !== inputSignature(w),
  };
}

function progressFor(key: string, attempts: Attempt[]): QuestionProgress {
  const mine = attempts.filter(a => a.questionKey === key && a.followUpOf === null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { attempts: mine.length, best: mine.length ? Math.max(...mine.map(a => a.score)) : null, latest: mine.at(-1)?.score ?? null };
}

/** Pack questions first (unique by wording; none for a master CV), then generated and claim questions in creation order. */
export function buildSessionQuestions(w: Workspace, extras: PracticeQuestion[], attempts: Attempt[]): SessionQuestion[] {
  const seen = new Set<string>();
  const questions: SessionQuestion[] = [];
  for (const q of w.kind === 'master' ? [] : w.package?.interview ?? []) {
    const text = q.question.trim();
    const key = packQuestionKey(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    questions.push({ key, text, guidance: q.guidance, source: 'pack', kind: null, evidence: q.evidence.map(source => sourceLabel(source, w)), claim: null, progress: progressFor(key, attempts) });
  }
  for (const q of [...extras].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = extraQuestionKey(q.id);
    const claim = q.kind === 'claim' && q.target && q.bullet ? { target: q.target, bullet: q.bullet } : null;
    questions.push({ key, text: q.question, guidance: q.guidance, source: claim ? 'claim' : 'extra', kind: q.kind, evidence: [], claim, progress: progressFor(key, attempts) });
  }
  return questions;
}

export function summarize(questions: SessionQuestion[]): PracticeSummary {
  const practised = questions.filter(q => q.progress.latest !== null);
  const average = practised.length
    ? Math.round((practised.reduce((sum, q) => sum + (q.progress.latest ?? 0), 0) / practised.length) * 10) / 10
    : null;
  return { practised: practised.length, total: questions.length, average };
}

/** Returns a user-facing error message, or null when the attempt target is valid. */
export function validateAttemptTarget(questions: SessionQuestion[], attempts: Attempt[], target: { questionKey: string; followUpOf: string | null }): string | null {
  if (!questions.some(q => q.key === target.questionKey)) return QUESTION_GONE;
  if (target.followUpOf === null) return null;
  const parent = attempts.find(a => a.id === target.followUpOf);
  return parent && parent.questionKey === target.questionKey && parent.followUpOf === null ? null : FOLLOW_UP_INVALID;
}

export function dedupeGenerated(generated: GeneratedQuestion[], existingTexts: string[]): GeneratedQuestion[] {
  const seen = new Set(existingTexts.map(normalizeQuestion));
  const fresh: GeneratedQuestion[] = [];
  for (const item of generated) {
    const normalized = normalizeQuestion(item.question);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    fresh.push(item);
  }
  return fresh;
}

/** CV facts sent to the AI and used by the fact guard; contact details are left out. */
export function cvFactsFor(w: Workspace): Record<string, string> {
  return Object.fromEntries(Object.entries(evidenceCatalog(w)).filter(([key, value]) => key !== 'personal' && value.trim()));
}
