import type { CheckTarget } from './cv-checker';
import type { Resume } from './schema';

/** One editable prose field of a CV, addressed by a stable key such as "experience.ID.achievements". */
export type CvField = { key: string; label: string; target: CheckTarget; text: string; titleCase?: boolean };

const TOP_FIELDS = ['summary', 'projects', 'skills', 'certifications', 'additional', 'awards', 'training', 'publications', 'strengths', 'interests'] as const;
type TopField = (typeof TOP_FIELDS)[number];
const EXTRA_FIELDS = [['awards', 'Awards'], ['training', 'Training'], ['publications', 'Publications'], ['strengths', 'Strengths'], ['interests', 'Interests']] as const;
const ENTRY_PROPS = { experience: ['title', 'achievements'], volunteering: ['role', 'achievements'], education: ['degree'] } as const;
type EntrySection = keyof typeof ENTRY_PROPS;
type Located = { kind: 'headline' } | { kind: 'top'; key: TopField } | { kind: 'entry'; section: EntrySection; id: string; prop: string };

const roleName = (title: string, organisation: string) => [title.trim(), organisation.trim()].filter(Boolean).join(' · ') || 'a role';

/** The lines of an achievements or projects field, without bullet markers or blank lines. */
export function bulletsOf(achievements: string): string[] {
  return achievements.split('\n').map(line => line.trim().replace(/^[•*–-]\s*/, '').trim()).filter(Boolean);
}

/** The CV's prose fields in reading order. Names, contact details, organisations and dates are left out. */
export function cvTextFields(resume: Resume): CvField[] {
  const fields: CvField[] = [
    { key: 'personal.professionalTitle', label: 'Headline', target: 'profile', text: resume.personal.professionalTitle, titleCase: true },
    { key: 'summary', label: 'Summary', target: 'summary', text: resume.summary },
  ];
  for (const e of resume.experience) {
    const name = 'Experience · ' + roleName(e.title, e.company);
    fields.push({ key: `experience.${e.id}.title`, label: name + ' (job title)', target: 'experience', text: e.title, titleCase: true });
    fields.push({ key: `experience.${e.id}.achievements`, label: name, target: 'experience', text: e.achievements });
  }
  for (const v of resume.volunteering) {
    const name = 'Volunteering · ' + roleName(v.role, v.organisation);
    fields.push({ key: `volunteering.${v.id}.role`, label: name + ' (role)', target: 'volunteering', text: v.role, titleCase: true });
    fields.push({ key: `volunteering.${v.id}.achievements`, label: name, target: 'volunteering', text: v.achievements });
  }
  fields.push({ key: 'projects', label: 'Projects', target: 'projects', text: resume.projects });
  for (const d of resume.education) {
    fields.push({ key: `education.${d.id}.degree`, label: 'Education · ' + (d.degree.trim() || 'a qualification'), target: 'education', text: d.degree, titleCase: true });
  }
  fields.push({ key: 'skills', label: 'Skills', target: 'skills', text: resume.skills });
  fields.push({ key: 'certifications', label: 'Certifications', target: 'certifications', text: resume.certifications });
  fields.push({ key: 'additional', label: 'Additional', target: 'additional', text: resume.additional });
  for (const [key, label] of EXTRA_FIELDS) fields.push({ key, label, target: key, text: resume[key] });
  return fields;
}

function locate(key: string): Located | null {
  if (key === 'personal.professionalTitle') return { kind: 'headline' };
  if ((TOP_FIELDS as readonly string[]).includes(key)) return { kind: 'top', key: key as TopField };
  const parts = key.split('.');
  if (parts.length < 3 || !Object.hasOwn(ENTRY_PROPS, parts[0])) return null;
  const section = parts[0] as EntrySection;
  const prop = parts[parts.length - 1];
  if (!(ENTRY_PROPS[section] as readonly string[]).includes(prop)) return null;
  return { kind: 'entry', section, id: parts.slice(1, -1).join('.'), prop };
}

/** The current text of a field, or null when the key names no prose field of this CV. */
export function fieldText(resume: Resume, key: string): string | null {
  const at = locate(key);
  if (!at) return null;
  if (at.kind === 'headline') return resume.personal.professionalTitle;
  if (at.kind === 'top') return resume[at.key];
  const entry = (resume[at.section] as { id: string }[]).find(e => e.id === at.id) as Record<string, unknown> | undefined;
  const value = entry?.[at.prop];
  return typeof value === 'string' ? value : null;
}

/** A copy of the CV with one field replaced, or null when the key names no prose field of this CV. */
export function withFieldText(resume: Resume, key: string, text: string): Resume | null {
  const at = locate(key);
  if (!at || fieldText(resume, key) === null) return null;
  if (at.kind === 'headline') return { ...resume, personal: { ...resume.personal, professionalTitle: text } };
  if (at.kind === 'top') return { ...resume, [at.key]: text };
  const entries = (resume[at.section] as { id: string }[]).map(e => (e.id === at.id ? { ...e, [at.prop]: text } : e));
  return { ...resume, [at.section]: entries } as Resume;
}

/** Applies a proofread fix to the first exact occurrence of its original wording; null when that wording is gone. */
export function applyProofread(resume: Resume, fix: { field: string; before: string; after: string }): Resume | null {
  const text = fieldText(resume, fix.field);
  if (text === null || !fix.before) return null;
  const at = text.indexOf(fix.before);
  if (at < 0) return null;
  return withFieldText(resume, fix.field, text.slice(0, at) + fix.after + text.slice(at + fix.before.length));
}
