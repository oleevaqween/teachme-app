'use client';
import { useId } from 'react';
import { marketLabels } from '@/lib/cv-studio/market';
import type { Market } from '@/lib/cv-studio/schema';

const MARKETS: Market[] = ['international', 'nigeria', 'us'];

export function MarketSwitch({ value, onChange, disabled }: { value: Market; onChange: (market: Market) => void; disabled?: boolean }) {
  const hintId = useId();
  return <fieldset className="spelling-variant" disabled={disabled} aria-describedby={hintId}>
    <legend>Applying in</legend>
    {MARKETS.map(m => <label key={m}>
      <input type="radio" name="cv-market" value={m} checked={value === m} onChange={() => onChange(m)} /> {marketLabels[m]}
    </label>)}
    <small id={hintId}>Sets the spelling, the length target and advice on personal details.</small>
  </fieldset>;
}
