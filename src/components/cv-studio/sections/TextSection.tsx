import type { Resume } from '@/lib/cv-studio/schema';
import { Field } from '../Field';

export const textSectionKeys = ['skills', 'certifications', 'additional', 'awards', 'training', 'publications', 'strengths', 'interests', 'references'] as const;
export type TextSectionKey = (typeof textSectionKeys)[number];

const hints: Partial<Record<TextSectionKey, string>> = {
  awards: 'One per line: the award, who gave it, and the year',
  training: 'One per line: the course, provider and year',
  publications: 'One per line: title, where it appeared, and the year',
  strengths: 'One per line: the strength, then a short example',
  interests: 'A few interests, one per line or comma-separated',
  references: 'Names and contact details, or "Available on request"',
};

export function TextSection({ resume, change, field }: { resume: Resume; change: (r: Resume) => void; field: TextSectionKey }) {
  const r = resume;
  const hint = hints[field];
  return <>
    {hint && <p className="studio-hint">{hint}</p>}
    <Field label="Details" area rows={6} value={r[field]} onChange={value => change({ ...r, [field]: value })} />
  </>;
}
