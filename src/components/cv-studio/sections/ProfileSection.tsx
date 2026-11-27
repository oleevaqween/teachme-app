import type { Resume } from '@/lib/cv-studio/schema';
import { Field } from '../Field';

export function ProfileSection({ resume, change }: { resume: Resume; change: (r: Resume) => void }) {
  const r = resume;
  const names: Record<keyof Resume['personal'], string> = { fullName: 'Full name', professionalTitle: 'Professional headline', email: 'Email', phone: 'Phone', location: 'Location', linkedin: 'LinkedIn / portfolio' };
  return <div className="field-grid">
      {(Object.keys(names) as (keyof Resume['personal'])[]).map(key => <Field key={key} label={names[key]} value={r.personal[key]} onChange={value => change({ ...r, personal: { ...r.personal, [key]: value } })} />)}
    </div>;
}
