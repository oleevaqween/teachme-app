import type { Analysis, Workspace } from './schema';

/**
 * Plain-English labels for CV Studio's internal codes, so the screens talk about
 * "your role at Acme" instead of `experience.exp1`. Display-only: nothing here
 * changes what is stored.
 */

type LabelContext = Pick<Workspace, 'resume'> & Partial<Pick<Workspace, 'evidenceGuides'>>;

const sectionNames: Record<string, string> = {
  personal: 'Your contact details',
  summary: 'Your summary',
  skills: 'Your skills',
  certifications: 'Your certifications',
  projects: 'Your projects',
  additional: 'Your additional information',
  languages: 'Your languages',
  awards: 'Your awards and achievements',
  training: 'Your training and courses',
  publications: 'Your publications and talks',
  strengths: 'Your strengths',
  interests: 'Your interests',
  references: 'Your references',
  notes: 'Your notes',
  company: 'About the employer',
};

const shorten = (value: string, max = 70) => (value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value);

function roleLabel(w: LabelContext, id: string): string | undefined {
  const role = w.resume.experience.find(e => e.id === id);
  if (!role) return undefined;
  const parts = [role.title.trim(), role.company.trim()].filter(Boolean);
  return parts.length ? parts.join(' at ') : undefined;
}

function guideAnswer(w: LabelContext, answerId: string) {
  for (const guide of w.evidenceGuides ?? []) {
    const answer = guide.answers.find(a => a.id === answerId);
    if (answer) return answer;
  }
  return undefined;
}

/** Where a piece of evidence came from, e.g. "Your role: Project Manager at Acme". */
export function sourceLabel(source: string, w: LabelContext): string {
  if (sectionNames[source]) return sectionNames[source];
  const [kind, id, fileId] = source.split('.');
  if (kind === 'experience' && id) {
    const role = roleLabel(w, id);
    return role ? 'Your role: ' + role : 'One of your past roles';
  }
  if (kind === 'education' && id) {
    const entry = w.resume.education.find(e => e.id === id);
    const label = entry ? [entry.degree.trim(), entry.institution.trim()].filter(Boolean).join(', ') : '';
    return label ? 'Your education: ' + label : 'Your education';
  }
  if (kind === 'volunteering' && id) {
    const entry = w.resume.volunteering.find(v => v.id === id);
    const label = entry ? [entry.role.trim(), entry.organisation.trim()].filter(Boolean).join(' at ') : '';
    return label ? 'Your volunteering: ' + label : 'Your volunteering';
  }
  if (kind === 'answer' && id) {
    const answer = guideAnswer(w, id);
    return answer ? 'Your answer to “' + shorten(answer.question) + '”' : 'One of your follow-up answers';
  }
  if (kind === 'document' && id) {
    const file = guideAnswer(w, id)?.attachments.find(f => f.id === fileId);
    return file ? 'Your document: ' + file.name : 'A document you added';
  }
  return source;
}

/** Which part of the CV a suggestion or review note is about. */
export function targetLabel(target: string, w: LabelContext): string {
  const sections: Record<string, string> = { summary: 'Summary', skills: 'Skills', projects: 'Projects', additional: 'Additional information', certifications: 'Certifications', education: 'Education', experience: 'Experience' };
  if (sections[target]) return sections[target];
  const match = /^experience\.([a-zA-Z0-9_-]+)/.exec(target);
  if (match) {
    const role = roleLabel(w, match[1]);
    return role ? 'Experience · ' + role : 'Experience';
  }
  return target;
}

export const importanceLabels: Record<Analysis['requirements'][number]['importance'], string> = {
  essential: 'Must-have',
  desirable: 'Nice to have',
  inferred: 'Implied by the posting',
};

export const assessmentLabels: Record<Analysis['requirements'][number]['assessment'], string> = {
  supported: 'Shown in your CV',
  partial: 'Partly shown',
  'not-recorded': 'Not yet in your CV',
  unverified: "Couldn't confirm",
};

export const suggestionStatusLabels: Record<'pending' | 'accepted' | 'rejected', string> = {
  pending: 'Awaiting your decision',
  accepted: 'Accepted',
  rejected: 'Declined',
};

const fileSafe = (value: string) =>
  value.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Download file name that identifies the person, the job and the date, so files
 * for different applications do not overwrite each other in Downloads.
 * e.g. "Adaeze-Nwankwo_Project-Manager_Acme_CV_2026-11-15.pdf"
 */
export function downloadFileName(
  w: Pick<Workspace, 'name' | 'kind' | 'analysis' | 'resume'>,
  kind: 'cv' | 'letter',
  extension: string,
  date = new Date(),
): string {
  const job = w.analysis ? [w.analysis.role, w.analysis.company] : w.kind === 'application' ? [w.name] : [];
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const parts = [w.resume.personal.fullName, ...job, kind === 'cv' ? 'CV' : 'Cover-letter', day].map(fileSafe).filter(Boolean);
  return parts.join('_') + '.' + extension;
}
