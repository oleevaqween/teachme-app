'use client';
import type { Attempt } from '@/lib/practice/schema';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AttemptHistory({ attempts, selectedId, onSelect }: { attempts: Attempt[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const mains = attempts.filter(a => a.followUpOf === null);
  if (!mains.length) return null;
  const chip = (a: Attempt, label: string, name: string) => (
    <button key={a.id} type="button" onClick={() => onSelect(a.id)} aria-label={`${name}: ${a.score} out of 10, ${when(a.createdAt)}`} aria-pressed={selectedId === a.id} title={when(a.createdAt)}
      className={`rounded-full px-2.5 py-0.5 text-caption font-medium ${selectedId === a.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-accent'}`}>
      {label}
    </button>
  );
  return (
    <section aria-label="Your attempts" className="space-y-2">
      <h3 className="text-lead leading-snug text-foreground">Your attempts</h3>
      <ol className="flex flex-wrap items-center gap-2">
        {mains.map((a, i) => (
          <li key={a.id} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
            {chip(a, `${a.score}/10`, `Attempt ${i + 1}`)}
            {attempts.filter(f => f.followUpOf === a.id).map(f => chip(f, `↳ ${f.score}/10`, `Follow-up to attempt ${i + 1}`))}
          </li>
        ))}
      </ol>
    </section>
  );
}
