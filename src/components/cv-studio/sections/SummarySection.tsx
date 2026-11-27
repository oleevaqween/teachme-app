import type { Resume } from '@/lib/cv-studio/schema';
import { Field } from '../Field';

export function SummarySection({ resume, change }: { resume: Resume; change: (r: Resume) => void }) {
  const r = resume;
  return <Field label="Summary" value={r.summary} onChange={summary => change({ ...r, summary })} area rows={5} placeholder="Your experience, focus and strongest relevant contribution." />;
}
