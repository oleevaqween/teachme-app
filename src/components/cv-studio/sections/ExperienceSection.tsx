import { Plus, Trash2 } from 'lucide-react';
import type { Resume } from '@/lib/cv-studio/schema';
import { Field } from '../Field';

export function ExperienceSection({ resume, change }: { resume: Resume; change: (r: Resume) => void }) {
  const r = resume;
  return <>
      <p className="studio-hint">Jobs and internships. Keep one achievement per line.</p>
      {r.experience.map((e, index) => <div className="entry-editor" key={e.id}>
        <div className="entry-top"><strong>Experience {index + 1}</strong><button type="button" className="icon-button" aria-label={'Remove experience ' + (index + 1)} onClick={() => change({ ...r, experience: r.experience.filter(x => x.id !== e.id) })}><Trash2 size={15} /></button></div>
        <div className="field-grid">{(['title','company','location','startDate','endDate'] as const).map(key => <Field key={key} label={{ title: 'Job title', company: 'Organization', location: 'Location', startDate: 'Start date', endDate: 'End date / Present' }[key]} value={e[key]} onChange={value => change({ ...r, experience: r.experience.map(x => x.id === e.id ? { ...x, [key]: value } : x) })} />)}</div>
        <Field label="Achievements & responsibilities" area rows={6} value={e.achievements} onChange={achievements => change({ ...r, experience: r.experience.map(x => x.id === e.id ? { ...x, achievements } : x) })} />
      </div>)}
      <button className="studio-button secondary" onClick={() => change({ ...r, experience: [...r.experience, { id: crypto.randomUUID(), title: '', company: '', location: '', startDate: '', endDate: '', achievements: '' }] })}><Plus size={15} /> Add experience</button>
    </>;
}
