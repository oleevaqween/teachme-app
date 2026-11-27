import { Plus, Trash2 } from 'lucide-react';
import type { Resume } from '@/lib/cv-studio/schema';
import { Field } from '../Field';

const labels = { role: 'Role', organisation: 'Organisation', location: 'Location', startDate: 'Start date', endDate: 'End date / Present' } as const;
const keys = Object.keys(labels) as (keyof typeof labels)[];

export function VolunteeringSection({ resume: r, change }: { resume: Resume; change: (r: Resume) => void }) {
  const edit = (id: string, patch: Partial<Resume['volunteering'][number]>) =>
    change({ ...r, volunteering: r.volunteering.map(x => x.id === id ? { ...x, ...patch } : x) });
  return <>
    <p className="studio-hint">Unpaid roles, such as charity, community or school work. Keep one achievement per line.</p>
    {r.volunteering.map((v, index) => <div className="entry-editor" key={v.id}>
      <div className="entry-top"><strong>Volunteering {index + 1}</strong><button type="button" className="icon-button" aria-label={'Remove volunteering ' + (index + 1)} onClick={() => change({ ...r, volunteering: r.volunteering.filter(x => x.id !== v.id) })}><Trash2 size={15} /></button></div>
      <div className="field-grid">{keys.map(key => <Field key={key} label={labels[key]} value={v[key]} onChange={value => change({ ...r, volunteering: r.volunteering.map(x => x.id === v.id ? { ...x, [key]: value } : x) })} />)}</div>
      <Field label="Achievements" area rows={5} value={v.achievements} onChange={achievements => edit(v.id, { achievements })} />
    </div>)}
    <button type="button" className="studio-button secondary" onClick={() => change({ ...r, volunteering: [...r.volunteering, { id: crypto.randomUUID(), role: '', organisation: '', location: '', startDate: '', endDate: '', achievements: '' }] })}><Plus size={15} /> Add volunteering</button>
  </>;
}
