import type { Resume } from '@/lib/cv-studio/schema';
import { Field } from '../Field';

export function ProjectsSection({ resume, change }: { resume: Resume; change: (r: Resume) => void }) {
  const r = resume;
  return <Field label="Projects & practical work" area rows={7} value={r.projects} onChange={projects => change({ ...r, projects })} placeholder="Project name, your role, what you built or delivered, and the result." />;
}
