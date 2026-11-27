import { Plus, Trash2 } from 'lucide-react';
import type { Resume } from '@/lib/cv-studio/schema';
import { languageLevels } from '@/lib/cv-studio/sections';
import { Field } from '../Field';

type Language = Resume['languages'][number];

export function LanguagesSection({ resume: r, change }: { resume: Resume; change: (r: Resume) => void }) {
  const edit = (id: string, patch: Partial<Language>) => change({ ...r, languages: r.languages.map(x => x.id === id ? { ...x, ...patch } : x) });
  return <>
    <p className="studio-hint">Languages you can work in, with an honest level.</p>
    {r.languages.map((l, index) => <div className="language-row" key={l.id}>
      <Field label={'Language ' + (index + 1)} value={l.language} onChange={language => edit(l.id, { language })} />
      <label className="studio-field"><span>Level</span>
        <select value={l.level} onChange={e => edit(l.id, { level: e.target.value as Language['level'] })}>
          <option value="">Level (optional)</option>
          {languageLevels.map(level => <option key={level} value={level}>{level}</option>)}
        </select>
      </label>
      <button type="button" className="icon-button" aria-label={'Remove language ' + (index + 1)} onClick={() => change({ ...r, languages: r.languages.filter(x => x.id !== l.id) })}><Trash2 size={15} /></button>
    </div>)}
    <button type="button" className="studio-button secondary" onClick={() => change({ ...r, languages: [...r.languages, { id: crypto.randomUUID(), language: '', level: '' }] })}><Plus size={15} /> Add language</button>
  </>;
}
