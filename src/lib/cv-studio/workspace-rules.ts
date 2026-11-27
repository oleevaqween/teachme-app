import type { Analysis, ApplicationPackage, Workspace } from './schema';

/** Name given to an application before the job has been analysed. */
export const DEFAULT_APPLICATION_NAME = 'New application';

/** PackageSchema caps interview questions at this many. */
const MAX_INTERVIEW_QUESTIONS = 12;

/** Normalises question wording for matching: lowercase, collapsed spaces, no trailing punctuation. */
export const normalizeQuestion = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s?.!:;]+$/, '');

/**
 * Keeps the user's practice answers when an application pack is regenerated.
 * Answers move onto a regenerated question with the same wording; answers whose
 * question disappeared are appended as their original question so nothing is
 * silently dropped. Anything beyond the schema's question cap is reported as
 * `notCarried` (it remains in the "Before package" version checkpoint).
 */
export function carryPracticeAnswers(
  previous: ApplicationPackage | null | undefined,
  next: ApplicationPackage,
): { package: ApplicationPackage; carried: number; notCarried: number } {
  const answered = (previous?.interview ?? []).filter(q => q.practiceAnswer?.trim());
  if (!answered.length) return { package: next, carried: 0, notCarried: 0 };

  const byQuestion = new Map(answered.map(q => [normalizeQuestion(q.question), q]));
  const matched = new Set<string>();
  const interview = next.interview.map(q => {
    const key = normalizeQuestion(q.question);
    const old = byQuestion.get(key);
    if (!old || q.practiceAnswer?.trim()) return q;
    matched.add(key);
    return { ...q, practiceAnswer: old.practiceAnswer };
  });

  const leftover = answered.filter(q => !matched.has(normalizeQuestion(q.question)));
  const room = Math.max(0, MAX_INTERVIEW_QUESTIONS - interview.length);
  const appended = leftover.slice(0, room);
  return {
    package: { ...next, interview: [...interview, ...appended] },
    carried: matched.size + appended.length,
    notCarried: leftover.length - appended.length,
  };
}

/** The automatic "role · company" name an analysis suggests for an application. */
export function analysisName(analysis: Pick<Analysis, 'role' | 'company'> | null | undefined): string {
  if (!analysis) return '';
  return [analysis.role, analysis.company].map(part => part.trim()).filter(Boolean).join(' · ').slice(0, 300);
}

/**
 * Chooses the application name after a job analysis. Only names that were never
 * customised (the default, or the previous automatic name) are replaced, so a
 * name the user typed is never overwritten.
 */
export function nameAfterAnalysis(target: Pick<Workspace, 'name' | 'analysis'>, analysis: Analysis): string {
  const suggested = analysisName(analysis);
  if (!suggested) return target.name;
  const untouched = target.name === DEFAULT_APPLICATION_NAME || target.name === analysisName(target.analysis);
  return untouched ? suggested : target.name;
}

/**
 * The CV a new application should be copied from: the master CV at the root of
 * the current workspace's family, so tailoring for one job never carries into
 * the next. Falls back to the current workspace if no master can be found.
 */
export function branchSource(current: Workspace, all: readonly Workspace[]): Workspace {
  if (current.kind === 'master') return current;
  const byId = new Map(all.map(w => [w.id, w]));
  const seen = new Set<string>();
  let node: Workspace | undefined = current;
  while (node && node.kind !== 'master' && node.parentId && !seen.has(node.id)) {
    seen.add(node.id);
    node = byId.get(node.parentId);
  }
  return node?.kind === 'master' ? node : current;
}

/**
 * A new application prepared straight from a master: `base` is the fresh application copied
 * from it, and the master's job advert, letter inputs, employer text and evidence guides come along.
 */
export function applicationFromMaster(source: Workspace, base: Workspace): Workspace {
  return { ...base, jobDescription: source.jobDescription, letterBrief: source.letterBrief, letterTone: source.letterTone, letterOpening: source.letterOpening,
    companyNotes: source.companyNotes, evidenceGuides: source.evidenceGuides ? structuredClone(source.evidenceGuides) : undefined };
}

/**
 * How the autosave should react to a failed save.
 * - `conflict`: another tab changed this CV; pause to avoid overwriting it.
 * - `fix`: the server rejected the content (e.g. invalid or too large); wait for the next edit.
 * - `retry`: connection or server hiccup; retry automatically.
 */
export function saveFailureKind(error: unknown): 'conflict' | 'fix' | 'retry' {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : NaN;
  if (status === 409) return 'conflict';
  if (status >= 400 && status < 500) return 'fix';
  return 'retry';
}

/**
 * The workspace CV Studio should open first: the one named by `?open=<id>`
 * (used by the Applications page), otherwise the most recently updated.
 */
export function pickInitialWorkspace<T extends { id: string }>(workspaces: readonly T[], search: string): T | undefined {
  const wanted = new URLSearchParams(search).get('open');
  return (wanted ? workspaces.find(w => w.id === wanted) : undefined) ?? workspaces[0];
}
