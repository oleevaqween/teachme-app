import { hasFigure } from './clarity';
import { parseCvDate, startsWithActionVerb } from './cv-checker';
import { bulletsOf } from './cv-text';
import { analysisMatchesJob, containsTerm, verifiedKeywords } from './job-match';
import { lengthTarget, marketLabels } from './market';
import { profileText, type Resume, type Workspace } from './schema';

export type CutProposal = {
  id: string; section: 'experience' | 'volunteering'; entryId: string; label: string; dates: string;
  /** The role's achievements when the proposal was made; applying refuses if they have changed. */
  before: string; after: string; kept: string[]; removed: string[];
};
export type CutPlan = { proposals: CutProposal[]; before: number; after: number; limit: number; marketLabel: string; overBy: number; nothingQualifies: boolean; allDismissed: boolean };

export const ROLE_CHANGED = 'This role has changed since the suggestions were made. Press Suggest cuts again.';

/** The refusal when a role was edited after the cuts were suggested, naming the role (so "Apply all" says which one). */
export function roleChangedMessage(label: string): string {
  const name = label.trim();
  return name ? `${name} has changed since the suggestions were made. Press Suggest cuts again.` : ROLE_CHANGED;
}

/** The word count the checker's length rule uses. */
export function cvWords(resume: Resume): number {
  return profileText(resume).split(/\s+/).filter(Boolean).length;
}

/** How many bullets a role keeps by how long ago it ended: 2 after 10 years, 0 after 15, otherwise it is left alone. */
export function keepCount(endMonth: number, now: Date): number | null {
  const ago = now.getFullYear() * 12 + now.getMonth() - endMonth;
  if (ago >= 180) return 0;
  if (ago >= 120) return 2;
  return null;
}

export function bulletScore(bullet: string, terms: string[]): number {
  const termPoints = Math.min(2, terms.filter(term => containsTerm(bullet, term)).length);
  return (hasFigure(bullet) ? 2 : 0) + (startsWithActionVerb(bullet) ? 1 : 0) + termPoints;
}

/** Keeps the strongest `keep` bullets (ties keep the earlier one) and deletes the other bullet lines; every other line is left as written. */
export function cutLines(achievements: string, keep: number, terms: string[]): { kept: string[]; removed: string[]; after: string } {
  const lines = achievements.split('\n');
  const isMarked = (line: string) => /^\s*[•*–-]/.test(line);
  const marked = lines.some(isMarked);
  const bullets: { indexes: number[]; text: string }[] = [];
  lines.forEach((line, index) => {
    const text = bulletsOf(line)[0];
    if (!text) return;
    const last = bullets[bullets.length - 1];
    // In a role that mixes marked and unmarked lines, an unmarked line wraps the marked line before it.
    if (marked && !isMarked(line) && last && isMarked(lines[last.indexes[0]])) {
      last.indexes.push(index);
      last.text += ' ' + line.trim();
    } else bullets.push({ indexes: [index], text });
  });
  const ranked = bullets.map((b, order) => ({ b, order })).sort((x, y) => bulletScore(y.b.text, terms) - bulletScore(x.b.text, terms) || x.order - y.order);
  const keptSet = new Set(ranked.slice(0, keep).map(r => r.b));
  const removedIndexes = new Set(bullets.filter(b => !keptSet.has(b)).flatMap(b => b.indexes));
  return {
    kept: bullets.filter(b => keptSet.has(b)).map(b => b.text),
    removed: bullets.filter(b => !keptSet.has(b)).map(b => b.text),
    after: lines.filter((_, index) => !removedIndexes.has(index)).join('\n'),
  };
}

export function applyCut(resume: Resume, proposal: CutProposal): Resume {
  if (proposal.section === 'experience') {
    const at = resume.experience.findIndex(e => e.id === proposal.entryId);
    if (at < 0 || resume.experience[at].achievements !== proposal.before) throw new Error(roleChangedMessage(proposal.label));
    return { ...resume, experience: resume.experience.map((e, i) => (i === at ? { ...e, achievements: proposal.after } : e)) };
  }
  const at = resume.volunteering.findIndex(v => v.id === proposal.entryId);
  if (at < 0 || resume.volunteering[at].achievements !== proposal.before) throw new Error(roleChangedMessage(proposal.label));
  return { ...resume, volunteering: resume.volunteering.map((v, i) => (i === at ? { ...v, achievements: proposal.after } : v)) };
}

/** Re-derives a stored plan's numbers from the CV as it is now: proposals whose role changed or vanished are dropped. */
export function refreshCutPlan(w: Workspace, plan: CutPlan, now: Date = new Date()): CutPlan {
  const current = (p: CutProposal) => (p.section === 'experience' ? w.resume.experience : w.resume.volunteering).find(e => e.id === p.entryId)?.achievements;
  const proposals = plan.proposals.filter(p => current(p) === p.before);
  let resume = w.resume;
  for (const proposal of proposals) resume = applyCut(resume, proposal);
  const market = w.market ?? 'international';
  const limit = lengthTarget(market, w.resume, now).long;
  const after = cvWords(resume);
  return { ...plan, proposals, before: cvWords(w.resume), after, limit, marketLabel: marketLabels[market], overBy: Math.max(0, after - limit) };
}

const roleLabel = (title: string, organisation: string) => [title.trim(), organisation.trim()].filter(Boolean).join(' · ') || 'A role';

/** Cuts to older roles, oldest first, until the CV fits its market's length target. Application CVs only. Roles in `dismissed` (proposal ids) are skipped. */
export function cutPlan(w: Workspace, now: Date = new Date(), dismissed: ReadonlySet<string> = new Set()): CutPlan {
  const market = w.market ?? 'international';
  const limit = lengthTarget(market, w.resume, now).long;
  const before = cvWords(w.resume);
  const empty: CutPlan = { proposals: [], before, after: before, limit, marketLabel: marketLabels[market], overBy: Math.max(0, before - limit), nothingQualifies: false, allDismissed: false };
  if (w.kind !== 'application' || before <= limit) return { ...empty, overBy: 0 };
  const terms = analysisMatchesJob(w) && w.analysis?.keywords ? verifiedKeywords(w.jobDescription, w.analysis.keywords).map(k => k.term) : [];
  const roles = [
    ...w.resume.experience.map((e, order) => ({ section: 'experience' as const, id: e.id, label: roleLabel(e.title, e.company), startDate: e.startDate, endDate: e.endDate, achievements: e.achievements, order })),
    ...w.resume.volunteering.map((v, order) => ({ section: 'volunteering' as const, id: v.id, label: roleLabel(v.role, v.organisation), startDate: v.startDate, endDate: v.endDate, achievements: v.achievements, order: w.resume.experience.length + order })),
  ];
  // Qualifying roles the user dismissed: when only these would have been proposed, the advice says so (C3).
  let dismissedQualifying = 0;
  const candidates = roles.flatMap(role => {
    const endMonth = parseCvDate(role.endDate, 'end', now);
    const keep = endMonth === null ? null : keepCount(endMonth, now);
    if (endMonth === null || keep === null) return [];
    const cut = cutLines(role.achievements, keep, terms);
    if (!cut.removed.length) return [];
    if (dismissed.has(`${role.section}.${role.id}`)) { dismissedQualifying += 1; return []; }
    const proposal: CutProposal = {
      id: `${role.section}.${role.id}`, section: role.section, entryId: role.id, label: role.label,
      dates: [role.startDate.trim(), role.endDate.trim()].filter(Boolean).join(' – '),
      before: role.achievements, after: cut.after, kept: cut.kept, removed: cut.removed,
    };
    return [{ proposal, endMonth, order: role.order }];
  }).sort((a, b) => a.endMonth - b.endMonth || a.order - b.order);
  const proposals: CutProposal[] = [];
  const seen = new Set<string>();
  let resume = w.resume;
  for (const { proposal } of candidates) {
    if (cvWords(resume) <= limit) break;
    // Ids are section plus entry id; saved CVs keep entry ids unique, but a repeat is skipped rather than shown twice.
    if (seen.has(proposal.id)) continue;
    seen.add(proposal.id);
    resume = applyCut(resume, proposal);
    proposals.push(proposal);
  }
  const after = cvWords(resume);
  return { ...empty, proposals, after, overBy: Math.max(0, after - limit), nothingQualifies: proposals.length === 0, allDismissed: proposals.length === 0 && dismissedQualifying > 0 };
}

export function cutSummary(plan: CutPlan): string {
  return `${plan.before} → ${plan.after} words · target ${plan.limit} (${plan.marketLabel})`;
}

export function cutAdvice(plan: CutPlan): string | null {
  if (plan.allDismissed) return "You've dismissed every suggested cut. Trim your recent roles yourself, or shorten the summary. Reload the page to bring the suggestions back.";
  if (plan.nothingQualifies) return 'No older roles to trim. Trim your recent roles yourself, or shorten the summary.';
  if (plan.overBy > 0) return `Still ${plan.overBy} words over. Trim your recent roles yourself, or shorten the summary.`;
  return null;
}
