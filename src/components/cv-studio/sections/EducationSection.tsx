import { Plus, Trash2 } from 'lucide-react';
import type { Resume } from '@/lib/cv-studio/schema';
import { Field } from '../Field';

export function EducationSection({ resume, change }: { resume: Resume; change: (r: Resume) => void }) {
  const r = resume;
  return <>
      {r.education.map((e, index) => <div className="entry-editor" key={e.id}>
        <div className="entry-top"><strong>Education {index + 1}</strong><button className="icon-button" aria-label={'Remove education ' + (index + 1)} onClick={() => change({ ...r, education: r.education.filter(x => x.id !== e.id) })}><Trash2 size={15} /></button></div>
        {(['degree','institution','graduationYear'] as const).map(key => <Field key={key} label={{ degree: 'Degree / qualification', institution: 'Institution', graduationYear: 'Year / dates' }[key]} value={e[key]} onChange={value => change({ ...r, education: r.education.map(x => x.id === e.id ? { ...x, [key]: value } : x) })} />)}
      </div>)}
      <button className="studio-button secondary" onClick={() => change({ ...r, education: [...r.education, { id: crypto.randomUUID(), degree: '', institution: '', graduationYear: '' }] })}><Plus size={15} /> Add education</button>
    </>;
}
