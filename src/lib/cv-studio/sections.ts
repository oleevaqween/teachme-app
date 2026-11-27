import type { Resume } from './schema';

/** The original seven CV sections, in their default order. */
export const coreSectionKeys = ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'additional'] as const;
/** Optional sections a CV can add. */
export const extraSectionKeys = ['volunteering', 'languages', 'awards', 'training', 'publications', 'strengths', 'interests', 'references'] as const;
export const sectionKeys = [...coreSectionKeys, ...extraSectionKeys] as const;
export type SectionKey = (typeof sectionKeys)[number];

export const languageLevels = ['Native or bilingual', 'Fluent', 'Professional working', 'Conversational', 'Basic'] as const;
export type LanguageLevel = (typeof languageLevels)[number];

/** Names used in the studio (editor headings, picker). */
export const sectionNames: Record<SectionKey, string> = {
  summary: 'Summary', experience: 'Experience', projects: 'Projects', education: 'Education', skills: 'Skills',
  certifications: 'Certifications', additional: 'Additional information', volunteering: 'Volunteering', languages: 'Languages',
  awards: 'Awards & achievements', training: 'Training & courses', publications: 'Publications & talks', strengths: 'Strengths',
  interests: 'Interests', references: 'References',
};

/** Headings printed on the CV. The first seven are unchanged from before. */
export const sectionLabels: Record<SectionKey, string> = {
  summary: 'Profile', experience: 'Experience', projects: 'Selected projects', education: 'Education', skills: 'Skills',
  certifications: 'Certifications', additional: 'Additional information', volunteering: 'Volunteering', languages: 'Languages',
  awards: 'Awards & achievements', training: 'Training & courses', publications: 'Publications & talks', strengths: 'Strengths',
  interests: 'Interests', references: 'References',
};

/** One-line descriptions shown in the "Add section" picker. */
export const sectionDescriptions: Record<SectionKey, string> = {
  summary: 'A short profile at the top', experience: 'Jobs, with dates and achievements', projects: 'Projects, one per line',
  education: 'Degrees and qualifications', skills: 'Skills, one per line', certifications: 'Certificates and licences',
  additional: 'Anything else worth saying', volunteering: 'Unpaid roles, with dates and achievements',
  languages: 'Languages you speak, with your level', awards: 'Prizes, recognition, scholarships', training: 'Short courses and CPD',
  publications: 'Articles, papers and talks', strengths: 'A strength and a one-line example', interests: 'A short list',
  references: 'Referees, or "Available on request"',
};

/** True when any field of an entry other than its id holds text; a row left completely blank prints nothing. */
export const rowHasText = (row: object) => Object.entries(row).some(([field, v]) => field !== 'id' && typeof v === 'string' && v.trim().length > 0);

/** True when a section has text, or at least one entry for entry-based sections. */
export function sectionHasContent(resume: Resume, key: SectionKey): boolean {
  const value = resume[key];
  return typeof value === 'string' ? value.trim().length > 0 : value.some(rowHasText);
}

/** Adds a section at the end of the order; returns a new array. */
export function addSection(order: readonly SectionKey[], key: SectionKey): SectionKey[] {
  return order.includes(key) ? [...order] : [...order, key];
}

/** Removes an empty section from the order; refuses when the section has content so nothing is ever hidden. */
export function removeSection(order: readonly SectionKey[], resume: Resume, key: SectionKey): SectionKey[] {
  if (sectionHasContent(resume, key)) throw new Error('Clear this section before removing it.');
  return order.filter(k => k !== key);
}

/** Sections the CV does not use yet, in default order. */
export function availableSections(order: readonly SectionKey[]): SectionKey[] {
  return sectionKeys.filter(k => !order.includes(k));
}

/** The order plus any section that has content but is missing from it, appended in default order. */
export function repairOrder(order: readonly SectionKey[], resume: Resume): SectionKey[] {
  const missing = sectionKeys.filter(k => !order.includes(k) && sectionHasContent(resume, k));
  return [...order, ...missing];
}

/** "French: Professional working", or "French" with no level; blank when there is no language. */
export function formatLanguage(entry: { language: string; level: string }): string {
  const language = entry.language.trim();
  if (!language) return '';
  return entry.level ? `${language}: ${entry.level}` : language;
}
