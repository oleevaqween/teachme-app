'use client';
import { useState } from 'react';
import { Check, PenLine, X } from 'lucide-react';
import type { Specificity } from '@/lib/cv-studio/cover-letter';
import type { ParagraphRewrite } from '@/lib/cv-studio/ai';

export const LETTER_WORTH_IT = 'Letters matter most for in-house roles, smaller employers and career changes. For agency applications a short note is often enough.';

/** Advice only: whether the letter uses a real example and a reason for this employer. */
export function SpecificityList({ result }: { result: Specificity }) {
  return <ul className="letter-specificity" aria-label="Is it specific?">
    <li className={result.example ? 'pass' : 'advice'}>{result.example ? 'Has a concrete example from your experience.' : 'Add one real example with its result from your experience.'}</li>
    {result.employer !== null && <li className={result.employer ? 'pass' : 'advice'}>{result.employer ? `Gives a reason specific to ${result.company}.` : 'Say why this employer, using the job advert or what you pasted about them.'}</li>}
  </ul>;
}

export type PendingRewrite = { index: number; result: ParagraphRewrite } | null;

/** Body paragraphs with a rewrite each; a passing rewrite is shown beside the original before anything changes. */
export function ParagraphRewriter({ paragraphs, busy, disabled, pending, onRewrite, onUse, onKeep }: {
  paragraphs: string[]; busy: boolean; disabled: boolean; pending: PendingRewrite;
  onRewrite: (index: number, instruction: string) => void; onUse: () => void; onKeep: () => void;
}) {
  const [instructions, setInstructions] = useState<Record<number, string>>({});
  const body = paragraphs.map((text, index) => ({ text, index })).slice(1, -1);
  return <div className="paragraph-rewriter">
    {body.map(({ text, index }) => <details key={index} className="requirement">
      <summary>Paragraph {index + 1}: {text.slice(0, 70)}{text.length > 70 ? '…' : ''}</summary>
      <input type="text" aria-label={`Instruction for paragraph ${index + 1}`} maxLength={300} placeholder="e.g. shorter, or lead with the result"
        value={instructions[index] ?? ''} onChange={e => setInstructions(prev => ({ ...prev, [index]: e.target.value }))} disabled={busy || disabled} />
      <button type="button" className="studio-button secondary" disabled={busy || disabled} onClick={() => onRewrite(index, instructions[index] ?? '')}>
        <PenLine size={15} aria-hidden="true" /> Rewrite this paragraph</button>
      {pending?.index === index && (pending.result.ok
        ? <>
            <div className="before-after"><div><small>NOW</small><p>{text}</p></div><div><small>REWRITTEN</small><p>{pending.result.paragraph}</p></div></div>
            <div className="improve-actions">
              <button type="button" className="studio-button" disabled={busy || disabled} onClick={onUse}><Check size={15} aria-hidden="true" /> Use this</button>
              <button type="button" className="studio-button secondary" disabled={busy} onClick={onKeep}><X size={15} aria-hidden="true" /> Keep mine</button>
            </div>
          </>
        : <div className="inline-warning" role="alert"><p>This rewrite did not pass the checks:</p><ul>{pending.result.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
            <p>Issues may refer to other paragraphs of your letter, because the whole letter is checked again.</p>
            <button type="button" className="studio-button secondary" disabled={busy} onClick={onKeep}><X size={15} aria-hidden="true" /> Dismiss</button></div>)}
    </details>)}
  </div>;
}
