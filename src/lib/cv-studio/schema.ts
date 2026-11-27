import { z } from 'zod';
import { EvidenceGuidesSchema, guidedEvidenceCatalog, guidedAnswerContext, type EvidenceGuide } from './evidence-schema';
import { ImproveSchema, type ImproveAnswer } from './improve-schema';
import { sourceQuote } from './source-quote';
import { templateIds } from './templates';
import { accentIds, fontPairIds } from './design';
import { columnStyles } from './columns';
import { coreSectionKeys, extraSectionKeys, formatLanguage, languageLevels, repairOrder, sectionKeys } from './sections';
export { sectionKeys } from './sections';

const text = z.string().max(12000);
const short = z.string().max(300);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const ResumeSchema = z.object({
  personal: z.object({ fullName: short, professionalTitle: short, email: short, phone: short, location: short, linkedin: short }),
  summary: text,
  experience: z.array(z.object({
    id, company: short, title: short, location: short, startDate: short, endDate: short, achievements: text,
  })).max(40).refine(entries => new Set(entries.map(e => e.id)).size === entries.length, 'Experience IDs must be unique'),
  education: z.array(z.object({ id, degree: short, institution: short, graduationYear: short })).max(30).refine(entries => new Set(entries.map(e => e.id)).size === entries.length, 'Education IDs must be unique'),
  skills: text, certifications: text, projects: text, additional: text,
  volunteering: z.array(z.object({ id, role: short, organisation: short, location: short, startDate: short, endDate: short, achievements: text }))
    .max(40).refine(entries => new Set(entries.map(e => e.id)).size === entries.length, 'Volunteering IDs must be unique').default([]),
  languages: z.array(z.object({ id, language: short, level: z.union([z.enum(languageLevels), z.literal('')]) }))
    .max(30).refine(entries => new Set(entries.map(e => e.id)).size === entries.length, 'Language IDs must be unique').default([]),
  awards: text.default(''), training: text.default(''), publications: text.default(''),
  strengths: text.default(''), interests: text.default(''), references: text.default(''),
});
export type Resume = z.infer<typeof ResumeSchema>;
export const LayoutSchema = z.object({
  template: z.enum(templateIds),
  accent: z.enum([...accentIds, 'custom']),
  fontSize: z.number().min(9).max(12),
  pageSize: z.enum(['A4', 'LETTER']),
  order: z.array(z.enum(sectionKeys)).max(sectionKeys.length).refine(v => new Set(v).size === v.length, 'Each section can appear only once'),
  // Written by the Design panel; lenient so stored data can never fail to parse. design.ts validates it when rendering.
  customAccent: z.string().max(20).optional(),
  fontPair: z.enum(fontPairIds).optional(),
  // Two-column settings (absent means one column / default side sections). No refine: a failed refine would hide the workspace.
  columns: z.enum(columnStyles).optional(),
  sideSections: z.array(z.enum(sectionKeys)).max(sectionKeys.length).optional(),
});
export type Layout = z.infer<typeof LayoutSchema>;
export const defaultLayout: Layout = { template: 'executive', accent: 'teal', fontSize: 10, pageSize: 'A4', order: [...coreSectionKeys] };
export function emptyResume(): Resume {
  return { personal: { fullName: '', professionalTitle: '', email: '', phone: '', location: '', linkedin: '' },
    summary: '', experience: [], education: [], skills: '', certifications: '', projects: '', additional: '',
    volunteering: [], languages: [], awards: '', training: '', publications: '', strengths: '', interests: '', references: '' };
}
export const SuggestionSchema = z.object({
  id, target: short, before: text, after: text, reason: text,
  evidence: z.array(z.object({ source: short, quote: text })).min(1).max(12),
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
  warnings: z.array(z.string().max(500)).max(12).optional(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;
export const RequirementSchema = z.object({
    requirement: short, jobQuote: text, importance: z.enum(['essential', 'desirable', 'inferred']),
    assessment: z.enum(['supported', 'partial', 'not-recorded', 'unverified']),
    evidence: z.array(z.object({ source: short, quote: text })).max(10), explanation: text,
  });
export const AnalysisSchema = z.object({
  role: short, company: short, overview: text,
  requirements: z.array(RequirementSchema).max(30),
  questions: z.array(z.object({ question: text, why: text })).max(8),
  suggestions: z.array(SuggestionSchema).max(30),
  keywords: z.array(z.object({ term: z.string().trim().min(2).max(100), importance: z.enum(['essential', 'desirable']) })).max(40).optional(),
  sectionReview: z.array(z.object({ target: short, reason: text })).max(45).optional(),
  notices: z.array(text).max(100).optional(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export const PackageSchema = z.object({
  coverLetter: text,
  coverLetterApproved: z.boolean().default(false),
  auditedLetter: text.optional(),
  letterNotice: text.optional(),
  letterStatus: z.enum(['draft', 'retained', 'unavailable']).optional(),
  letterIssues: z.array(z.string().max(1500)).max(12).optional(),
  letterWarnings: z.array(z.string().max(1500)).max(12).optional(),
  letterReview: z.array(z.object({ index: z.number().int().min(0), evidence: z.array(z.object({ source: short, quote: text })) })).optional(),
  interview: z.array(z.object({ question: text, guidance: text, evidence: z.array(short).max(10), practiceAnswer: text.optional() })).max(12),
  learningPriorities: z.array(z.object({ topic: short, exercise: text })).max(8),
  guidanceWarnings: z.array(z.string().max(500)).max(24).optional(),
});
export type ApplicationPackage = z.infer<typeof PackageSchema>;
export const SpellingVariantSchema = z.enum(['en-GB', 'en-US']);
export const MarketSchema = z.enum(['international', 'nigeria', 'us']);
export type Market = z.infer<typeof MarketSchema>;
export const OwnWordsSchema = z.array(z.string().trim().min(1).max(60)).max(500);
export const WorkspaceSchema = z.object({
  id, name: short.min(1), kind: z.enum(['master', 'application']), parentId: id.nullable(),
  resume: ResumeSchema, layout: LayoutSchema, jobDescription: z.string().max(24000),
  evidenceNotes: text,
  letterBrief: z.string().max(3000).optional(),
  companyNotes: z.string().max(6000).optional(),
  letterTone: z.enum(['direct', 'warm', 'formal']).optional(),
  letterOpening: z.enum(['employer-led', 'achievement-led']).optional(),
  evidenceGuides: EvidenceGuidesSchema.optional(),
  improve: ImproveSchema.optional(),
  spelling: SpellingVariantSchema.optional(),
  market: MarketSchema.optional(),
  ownWords: OwnWordsSchema.optional(),
  importSource: z.string().max(65000).optional(),
  analysis: AnalysisSchema.nullable(), analysisInput: z.string().max(200000).nullable(),
  package: PackageSchema.nullable(), packageInput: z.string().max(200000).nullable(),
}).transform(w => {
  // A section with content is never hidden: add it back if a stored order leaves it out.
  const order = repairOrder(w.layout.order, w.resume);
  return order.length === w.layout.order.length ? w : { ...w, layout: { ...w.layout, order } };
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type SavedWorkspace = Workspace & { revision: number; updatedAt: string };
export type Version = { id: string; label: string; createdAt: string; workspace: Workspace };

export function profileText(resume: Resume): string {
  return [resume.personal.fullName, resume.personal.professionalTitle,
    Object.values(resume.personal).slice(2).filter(Boolean).join(' | '),
    resume.summary, ...resume.experience.map(e => [e.title, e.company, e.location, e.startDate, e.endDate, e.achievements].filter(Boolean).join('\n')),
    resume.projects, ...resume.education.map(e => [e.degree, e.institution, e.graduationYear].join(', ')),
    resume.skills, resume.certifications, resume.additional,
    ...resume.volunteering.map(v => [v.role, v.organisation, v.location, v.startDate, v.endDate, v.achievements].filter(Boolean).join('\n')),
    resume.languages.map(formatLanguage).filter(Boolean).join('\n'),
    resume.awards, resume.training, resume.publications, resume.strengths, resume.interests, resume.references].filter(Boolean).join('\n\n');
}
/** The resume without empty new sections, so fingerprints stay identical to those stored before the new sections existed. */
export function signatureResume(resume: Resume): Partial<Resume> {
  const copy: Record<string, unknown> = { ...resume };
  for (const key of extraSectionKeys) {
    const value = copy[key];
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete copy[key];
  }
  return copy as Partial<Resume>;
}
export function inputSignature(w: Workspace): string {
  const guided = guidedEvidenceCatalog(w);
  const context = guidedAnswerContext(w);
  return JSON.stringify([signatureResume(w.resume), w.jobDescription, w.evidenceNotes, ...(Object.keys(guided).length ? [guided] : []), ...(context.length ? [context] : []), ...(w.letterBrief?.trim() ? [w.letterBrief] : []), ...(w.companyNotes?.trim() ? [{ companyNotes: w.companyNotes }] : []), ...(w.letterTone || w.letterOpening ? [{ letterTone: w.letterTone ?? 'direct', letterOpening: w.letterOpening ?? 'employer-led' }] : [])]);
}
export function analysisSignature(w: Workspace): string {
  return inputSignature({ ...w, letterBrief: undefined, companyNotes: undefined, letterTone: undefined, letterOpening: undefined });
}
/** Object key order is not an input change. Array order remains significant. */
export function sameInputs(a: string | null, b: string): boolean {
  if (a === b) return true;
  if (!a) return false;
  const canonical = (value: unknown) => JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([x], [y]) => x.localeCompare(y))) : entry);
  try { return canonical(JSON.parse(a)) === canonical(JSON.parse(b)); } catch { return false; }
}
export function evidenceCatalog(w: Pick<Workspace, 'resume' | 'evidenceNotes'> & { jobDescription?: string; evidenceGuides?: EvidenceGuide[]; improve?: { answers: ImproveAnswer[] } }): Record<string, string> {
  return {
    ...guidedEvidenceCatalog({ ...w, jobDescription: w.jobDescription ?? '' }),
    personal: Object.values(w.resume.personal).filter(Boolean).join('\n'),
    summary: w.resume.summary, skills: w.resume.skills, certifications: w.resume.certifications,
    projects: w.resume.projects, additional: w.resume.additional, notes: w.evidenceNotes,
    ...Object.fromEntries(w.resume.experience.map(e => ['experience.' + e.id, [e.title, e.company, e.location, e.startDate, e.endDate, e.achievements].join('\n')])),
    ...Object.fromEntries(w.resume.education.map(e => ['education.' + e.id, [e.degree, e.institution, e.graduationYear].join(', ')])),
    ...Object.fromEntries(w.resume.volunteering.map(v => ['volunteering.' + v.id, [v.role, v.organisation, v.location, v.startDate, v.endDate, v.achievements].join('\n')])),
    ...Object.fromEntries([
      ['languages', w.resume.languages.map(formatLanguage).filter(Boolean).join('\n')],
      ...(['awards', 'training', 'publications', 'strengths', 'interests', 'references'] as const).map(key => [key, w.resume[key]]),
    ].filter(([, value]) => value.trim())),
  };
}
export function targetText(resume: Resume, target: string): string | undefined {
  if (['summary','skills','projects','additional'].includes(target)) return resume[target as 'summary'|'skills'|'projects'|'additional'];
  if (target === 'personal.professionalTitle') return resume.personal.professionalTitle;
  const role = /^(experience|volunteering)\.([a-zA-Z0-9_-]+)\.achievements$/.exec(target);
  if (!role) return undefined;
  return role[1] === 'experience' ? resume.experience.find(e => e.id === role[2])?.achievements : resume.volunteering.find(v => v.id === role[2])?.achievements;
}
export function applySuggestion(resume: Resume, suggestion: Suggestion): Resume {
  if (targetText(resume, suggestion.target) !== suggestion.before) throw new Error('This section changed. Prepare fresh suggestions before applying this edit.');
  const result = structuredClone(resume);
  const role = /^(experience|volunteering)\.([a-zA-Z0-9_-]+)\.achievements$/.exec(suggestion.target);
  if (role?.[1] === 'experience') result.experience.find(e => e.id === role[2])!.achievements = suggestion.after;
  else if (role?.[1] === 'volunteering') result.volunteering.find(v => v.id === role[2])!.achievements = suggestion.after;
  else if (suggestion.target === 'personal.professionalTitle') result.personal.professionalTitle = suggestion.after;
  else result[suggestion.target as 'summary'|'skills'|'projects'|'additional'] = suggestion.after;
  return ResumeSchema.parse(result);
}
export function newNumbers(before: string, after: string): string[] {
  const numbers = (v: string) => v.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g) ?? [];
  // Only normalize unambiguous English thousands grouping. Preserve decimals,
  // percentages and plus qualifiers; this is not permission to derive metrics.
  const canonical = (n: string) => /^\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:%|\+)?$/.test(n) ? n.replaceAll(',', '') : n;
  const known = new Set(numbers(before).map(canonical));
  return numbers(after).filter(n => !known.has(canonical(n)));
}
export function validateAnalysis(raw: unknown, w: Workspace): Analysis {
  const result = AnalysisSchema.parse(raw);
  // Notices describe our checks, never a model's self-reported verification.
  result.notices = [];
  const catalog = evidenceCatalog(w);
  const checkEvidence = (refs: { source: string; quote: string }[]) => refs.every(e => {
    const original = sourceQuote(catalog[e.source], e.quote);
    if (original === null) return false;
    e.quote = original; return true;
  });
  for (const r of result.requirements) {
    const jobQuote = sourceQuote(w.jobDescription, r.jobQuote);
    const badJob = r.importance !== 'inferred' && jobQuote === null;
    const badEvidence = !checkEvidence(r.evidence) || ((r.assessment === 'supported' || r.assessment === 'partial') && !r.evidence.length);
    r.jobQuote = jobQuote ?? '';
    if (badJob || badEvidence || r.assessment === 'unverified') {
      if (badJob) r.importance = 'inferred';
      r.assessment = 'unverified';
      r.evidence = r.evidence.filter(e => sourceQuote(catalog[e.source], e.quote) !== null).map(e => ({ ...e, quote: sourceQuote(catalog[e.source], e.quote)! }));
      r.explanation = badJob ? 'This requirement could not be traced to the posting. Check it against the original job description; it is not a verified employer requirement.' : 'The model did not provide verifiable evidence for this assessment. This is not a finding that you lack the skill. Review the source or add a specific example.';
      result.notices!.push(`The assessment for "${r.requirement}" is unverified. Other verified results remain available.`);
    }
  }
  const counts = new Map<string, number>();
  for (const s of result.suggestions) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
  result.suggestions = result.suggestions.filter(s => {
    const label = s.target.startsWith('experience.') ? 'an experience section' : s.target;
    const skip = (reason: string) => {
      result.notices!.push(`A proposed edit to ${label} was withheld: ${reason} Your existing CV text was kept.`);
      return false;
    };
    if (counts.get(s.id) !== 1) return skip('its identifier was ambiguous.');
    s.status = 'pending';
    if (!/^(?:summary|skills|projects|additional|experience\.[a-zA-Z0-9_-]+\.achievements)$/.test(s.target)) return skip('it targets a part of the CV that job tailoring does not edit.');
    if (targetText(w.resume, s.target) !== s.before || !checkEvidence(s.evidence)) return skip('it could not be traced to your original field and cited career evidence.');
    if (newNumbers(s.evidence.map(e => e.quote).join('\n') + '\n' + s.before, s.after).length) return skip('it contained numbers that could not be verified against your original text and cited evidence.');
    return true;
  });
  return result;
}
export type Finding = { severity: 'error' | 'warning' | 'info'; title: string; detail: string };
export function checkResume(r: Resume): Finding[] {
  const out: Finding[] = [];
  if (!r.personal.fullName.trim()) out.push({ severity: 'error', title: 'Add your name', detail: 'Your exported CV needs an identifiable contact block.' });
  if (!r.personal.email.trim() && !r.personal.phone.trim()) out.push({ severity: 'warning', title: 'Add a contact method', detail: 'Include an email address or phone number.' });
  if (r.personal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.personal.email)) out.push({ severity: 'warning', title: 'Check your email address', detail: r.personal.email });
  if (!r.experience.length && !r.volunteering.length && !r.projects.trim()) out.push({ severity: 'warning', title: 'Show your experience', detail: 'Projects, volunteering and internships count too.' });
  const bullets = r.experience.flatMap(e => e.achievements.split('\n')).map(s => s.trim()).filter(Boolean);
  if (new Set(bullets.map(s => s.toLowerCase())).size < bullets.length) out.push({ severity: 'warning', title: 'Repeated achievement', detail: 'At least two experience bullets have identical wording.' });
  for (const e of r.experience) {
    if (!e.title.trim() || !e.company.trim()) out.push({ severity: 'warning', title: 'Incomplete experience entry', detail: 'Check the role and organization for each entry.' });
    const start = Date.parse(e.startDate), end = Date.parse(e.endDate);
    if (Number.isFinite(start) && Number.isFinite(end) && start > end) out.push({ severity: 'warning', title: 'Check employment dates', detail: e.company + ': the end date precedes the start date.' });
  }
  if (/\b(responsible for|team player|go-getter|synergy)\b/i.test(profileText(r))) out.push({ severity: 'info', title: 'Make the wording more specific', detail: 'Replace generic phrases with the action you took and the result, where known.' });
  if (profileText(r).split(/\s+/).length > 1100) out.push({ severity: 'info', title: 'Review the length', detail: 'Consider which details serve this application. Keep the complete history in your master CV.' });
  return out;
}
