'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** Formats elapsed seconds as m:ss. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/**
 * Progress banner for long CV Studio actions. Shows a live elapsed timer and, for
 * AI work, how long it usually takes, so a 2-minute wait does not look frozen.
 * Mount it with `key={label}` so the timer restarts for each new action.
 */
export function WorkingBanner({ label, ai, onCancel }: { label: string; ai: boolean; onCancel?: () => void }) {
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = (now - started) / 1000;
  return (
    <div className="studio-working" role="status">
      <Loader2 size={17} className="spin" />
      {label}
      <span>
        {elapsed >= 2 && <strong>{formatElapsed(elapsed)}</strong>}
        {ai
          ? elapsed < 180
            ? ' AI steps usually take 1–3 minutes. You can keep reading while you wait.'
            : ' Taking longer than usual. It will stop by itself at 4 minutes, or you can cancel.'
          : ' This may take a moment.'}
      </span>
      {ai && onCancel && <button onClick={onCancel}>Cancel AI request</button>}
    </div>
  );
}
