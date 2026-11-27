import type { Resume } from '@/lib/cv-studio/schema';
import { ProfileSection } from './sections/ProfileSection';
import { SummarySection } from './sections/SummarySection';
import { ExperienceSection } from './sections/ExperienceSection';
import { ProjectsSection } from './sections/ProjectsSection';
import { EducationSection } from './sections/EducationSection';
import { TextSection } from './sections/TextSection';
export { Field } from './Field';

export function ResumeEditor({ resume: r, change }: { resume: Resume; change: (r: Resume) => void }) {
  return <div className="editor-sections">
    <details open><summary>Contact & headline</summary><ProfileSection resume={r} change={change} /></details>
    <details open><summary>Professional profile</summary><SummarySection resume={r} change={change} /></details>
    <details open><summary>Experience <small>{r.experience.length}</small></summary><ExperienceSection resume={r} change={change} /></details>
    <details><summary>Projects</summary><ProjectsSection resume={r} change={change} /></details>
    <details><summary>Education <small>{r.education.length}</small></summary><EducationSection resume={r} change={change} /></details>
    {(['skills','certifications','additional'] as const).map(key => <details key={key}><summary>{{ skills: 'Skills', certifications: 'Certifications', additional: 'Additional information' }[key]}</summary><TextSection resume={r} change={change} field={key} /></details>)}
  </div>;
}

