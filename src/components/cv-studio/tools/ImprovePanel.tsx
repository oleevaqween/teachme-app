'use client';
import { useState } from 'react';
import { Check, Mic, MessageSquareText, Pencil, Sparkles, X } from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import { improveAnswerId, improveItems, type ImproveItem } from '@/lib/cv-studio/improve-rules';
import type { ImproveAnswer } from '@/lib/cv-studio/improve-schema';
import type { ImproveQuestion, ImproveSuggestion } from '@/lib/cv-studio/improve';
import { bulletsOf, fieldText } from '@/lib/cv-studio/cv-text';
import type { StudioController } from '../useStudioController';

const NUMBER_CHOICES: { value: ImproveAnswer['number']; label: string }[] = [
  { value: 'exact', label: 'Exact' }, { value: 'approximate', label: 'Approximate' }, { value: 'none', label: 'No number' },
];

export function ImproveItems({ items, selected, onSelect }: { items: ImproveItem[]; selected: string; onSelect: (target: string) => void }) {
  return <ul className="improve-items">
    {items.map(item => <li key={item.target}>
      <button type="button" className="improve-item" aria-pressed={selected === item.target} onClick={() => onSelect(item.target)}>
        <strong>{item.label}</strong><small>{item.reason}</small>
      </button>
    </li>)}
  </ul>;
}

const blank = (id: string, target: string, q: { bullet: string; question: string }): ImproveAnswer => ({ id, target, bullet: q.bullet.slice(0, 2000), question: q.question.slice(0, 2000), answer: '', number: 'none', status: 'draft' });

export function ImproveQuestions({ target, questions, answers, fallback, busy, onAnswer, onClear }: {
  target: string; questions: ImproveQuestion[]; answers: ImproveAnswer[]; fallback: boolean; busy: boolean; onAnswer: (a: ImproveAnswer) => void; onClear?: () => void;
}) {
  const current = questions.map(q => ({ q, id: improveAnswerId(target, q.question) }));
  const shown = new Set(current.map(x => x.id));
  const cards = [
    ...current.map(({ q, id }) => ({ id, why: q.why, saved: answers.find(a => a.id === id) ?? blank(id, target, q) })),
    ...answers.filter(a => a.target === target && !shown.has(a.id)).map(a => ({ id: a.id, why: '', saved: a })),
  ];
  return <div className="improve-questions">
    {fallback && <p className="studio-hint">The AI could not be reached, so these are the standard questions. Answer what you can.</p>}
    {cards.map(({ id, why, saved }) => {
      const set = (patch: Partial<ImproveAnswer>) => onAnswer({ ...saved, ...patch, status: patch.status ?? (((patch.answer ?? saved.answer).trim()) ? 'answered' : 'draft') });
      return <fieldset key={id} className="improve-question" disabled={busy}>
        <legend>{saved.question}</legend>
        {saved.bullet && <p className="improve-bullet">“{saved.bullet}”</p>}
        {why && <small>{why}</small>}
        <textarea aria-label={saved.question} rows={3} maxLength={6000} value={saved.answer} onChange={e => set({ answer: e.target.value })} />
        <div className="improve-number" role="radiogroup" aria-label="Is there a number in your answer?">
          {NUMBER_CHOICES.map(choice => <label key={choice.value}><input type="radio" name={'n-' + id} checked={saved.number === choice.value} onChange={() => set({ number: choice.value })} /> {choice.label}</label>)}
        </div>
        <small>Pick Approximate if your answer is an estimate (about, around, up to).</small>
        <div className="improve-number">
          <button type="button" className="text-button" aria-pressed={saved.status === 'skipped'} onClick={() => set({ status: 'skipped' })}>Skip</button>
          {saved.status === 'skipped' && <small>Skipped</small>}
        </div>
      </fieldset>;
    })}
    {onClear && answers.some(a => a.target === target) && <button type="button" className="text-button" disabled={busy} onClick={onClear}>Clear my answers for this part</button>}
  </div>;
}

const sourceLabel = (source: string) => source.startsWith('improve.') ? 'Your answer' : /^(experience|volunteering)\./.test(source) ? 'This role' : source === 'projects' ? 'Projects' : 'Your CV';
const shorten = (quote: string) => (quote.length > 160 ? quote.slice(0, 157) + '...' : quote);

export function ImproveSuggestionCard({ suggestion: s, busy, onAccept, onReject }: { suggestion: ImproveSuggestion; busy: boolean; onAccept: (after: string) => void; onReject: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.after);
  return <article className="improve-suggestion">
    <p>{s.reason}</p>
    <div className="before-after"><div><small>NOW</small><p>{s.before || '(Empty)'}</p></div><div><small>SUGGESTED</small>{editing ? <textarea aria-label="Edit the suggestion" rows={3} value={text} onChange={e => setText(e.target.value)} /> : <p>{text}</p>}</div></div>
    {!!s.flags.length && <ul className="improve-flags" aria-label="Check before accepting">{s.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
    {editing && text !== s.after && <p className="studio-hint">Checks above apply to the suggested wording; review your edit.</p>}
    {!!s.sources.length && <div className="improve-sources"><small>Based on:</small><ul>{s.sources.map((src, i) => <li key={i}><small>{sourceLabel(src.source)}: “{shorten(src.quote)}”</small></li>)}</ul></div>}
    {!!s.warnings.length && <ul className="studio-hint voice-warnings" aria-label="Writing suggestions">{s.warnings.map((f, i) => <li key={i}>{f}</li>)}</ul>}
    <div className="improve-actions">
      <button type="button" className="studio-button" disabled={busy || !text.trim()} onClick={() => onAccept(text)}><Check size={15} aria-hidden="true" /> Accept</button>
      <button type="button" className="studio-button secondary" disabled={busy} onClick={() => setEditing(!editing)}><Pencil size={15} aria-hidden="true" /> Edit</button>
      <button type="button" className="studio-button secondary" disabled={busy} onClick={onReject}><X size={15} aria-hidden="true" /> Reject</button>
    </div>
  </article>;
}

/** Each bullet of the selected role or Projects, with a button that opens Mock Interview on that claim. */
export function DefendList({ bullets, busy, onDefend }: { bullets: string[]; busy: boolean; onDefend: (bullet: string) => void }) {
  if (!bullets.length) return null;
  return <div className="defend-list">
    <h4 className="subheading">Defend it in interview</h4>
    <p className="studio-hint">Practise answering an interviewer&apos;s question about one bullet in Mock Interview. A strong answer can be saved back here as evidence.</p>
    <ul>
      {bullets.map((bullet, i) => <li key={i}>
        <span>{bullet}</span>
        <button type="button" className="studio-button secondary" disabled={busy} aria-label={'Practise defending this: ' + bullet} onClick={() => onDefend(bullet)}><Mic size={15} aria-hidden="true" /> Practise defending this</button>
      </li>)}
    </ul>
  </div>;
}

export function ImprovePanel({ c, w }: { c: StudioController; w: Workspace }) {
  const items = improveItems(w.resume);
  const selected = items.find(i => i.target === c.improve.target);
  const busy = !!c.busy;
  return <section className="improve-panel">
    <div className="panel-intro"><h2>Improve my CV</h2><p>Pick one part of your CV. For roles and projects you answer a few questions first; every suggestion uses only your CV and your answers, and you accept, edit or reject each one.</p></div>
    <ImproveItems items={items} selected={c.improve.target} onSelect={c.setImproveTarget} />
    {selected && <div className="improve-work">
      <h3 className="subheading">{selected.label}</h3>
      {selected.kind === 'bullets' && <>
        <button type="button" className="studio-button secondary" disabled={busy} onClick={() => void c.askImprove(selected.target)}><MessageSquareText size={15} aria-hidden="true" /> {c.improve.questions.length ? 'Ask different questions' : 'Ask me questions'}</button>
        <ImproveQuestions target={selected.target} questions={c.improve.questions} fallback={c.improve.fallback} busy={busy} answers={w.improve?.answers ?? []} onAnswer={c.answerImprove} onClear={() => c.clearImproveAnswers(selected.target)} />
        <DefendList bullets={bulletsOf(fieldText(w.resume, selected.field) ?? '')} busy={busy} onDefend={bullet => void c.defendClaim(selected.target, bullet)} />
      </>}
      <button type="button" className="studio-button" disabled={busy} onClick={() => void c.suggestImprove(selected.target)}><Sparkles size={15} aria-hidden="true" /> Suggest improvements</button>
      {c.improve.notices.map((n, i) => <p key={i} className="studio-hint">{n}</p>)}
      {c.improve.suggestions.map(s => <ImproveSuggestionCard key={s.id + s.after} suggestion={s} busy={busy} onAccept={after => void c.acceptImprove(s, after)} onReject={() => c.rejectImprove(s)} />)}
    </div>}
  </section>;
}
