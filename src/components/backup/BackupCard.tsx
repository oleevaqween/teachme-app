'use client';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { filenameFromDisposition } from '@/lib/backup/file-name';

const FAILED = 'The backup could not be created. Please try again.';

export function BackupCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/backup', { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || FAILED);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFromDisposition(response.headers.get('Content-Disposition'), 'teachme-career-backup.json');
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="backup-title" className="mt-6 rounded-xl border border-border bg-card p-6">
      <h2 id="backup-title" className="text-lead leading-snug text-foreground">Back up your career data</h2>
      <p className="mt-1 text-small text-foreground-secondary">
        Downloads one file with all your CVs and saved versions, your tracked applications, and your interview practice history.
      </p>
      <button type="button" onClick={() => void download()} disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
        {busy ? 'Preparing backup…' : 'Download career backup'}
      </button>
      {error && <p role="alert" className="mt-3 text-small text-destructive">{error}</p>}
      <p className="mt-3 text-caption text-muted-foreground">The file contains your CV, contact details and practice answers. Keep it somewhere private.</p>
    </section>
  );
}
