import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runExport, TRANSFER_UNVERIFIED, type ExportReply, type ExportSteps } from './export-file';

const reply = (text = 'PDF bytes', sha256 = createHash('sha256').update(text).digest('hex')): ExportReply =>
  ({ contentBase64: Buffer.from(text).toString('base64'), mediaType: 'application/pdf', verification: { pages: 2, sha256 } });

/** Steps that record what happened, in order. */
function record(view: boolean, fetchExport: () => Promise<ExportReply>, failLabelledSave = false): { calls: string[]; steps: ExportSteps } {
  const calls: string[] = [];
  return { calls, steps: {
    view, label: 'Exported cv PDF',
    save: async label => {
      calls.push('save:' + (label ?? 'edits'));
      if (label && failLabelledSave) throw new Error('Saving is paused to protect conflicting changes.');
    },
    fetchExport: async () => { calls.push('export'); return fetchExport(); },
    show: blob => { calls.push('show:' + blob.type); },
    download: blob => { calls.push('download:' + blob.type); },
  } };
}

describe('exporting a file', () => {
  it('saves the Exported version only after the file is made and checked, just before the download', async () => {
    const { calls, steps } = record(false, async () => reply());
    expect(await runExport(steps)).toBe('Export text and reading order checked · 2 pages.');
    expect(calls).toEqual(['save:edits', 'export', 'save:Exported cv PDF', 'download:application/pdf']);
  });

  it('saves no Exported version when the export fails', async () => {
    const { calls, steps } = record(false, async () => { throw new Error('Review and approve every factual claim in the cover letter before exporting.'); });
    await expect(runExport(steps)).rejects.toThrow('Review and approve');
    expect(calls).toEqual(['save:edits', 'export']);
  });

  it('saves no Exported version when the file fails its check', async () => {
    const { calls, steps } = record(false, async () => reply('PDF bytes', '0'.repeat(64)));
    await expect(runExport(steps)).rejects.toThrow(TRANSFER_UNVERIFIED);
    expect(calls).toEqual(['save:edits', 'export']);
  });

  it('does not hand over the file when its record cannot be saved', async () => {
    const { calls, steps } = record(false, async () => reply(), true);
    await expect(runExport(steps)).rejects.toThrow('Saving is paused');
    expect(calls).toEqual(['save:edits', 'export', 'save:Exported cv PDF']);
  });

  it('viewing the exact PDF saves no version', async () => {
    const { calls, steps } = record(true, async () => ({ ...reply(), verification: { ...reply().verification, pages: 1, fontNotice: 'Fonts were embedded.' } }));
    expect(await runExport(steps)).toBe('Export text and reading order checked · 1 page. Fonts were embedded.');
    expect(calls).toEqual(['save:edits', 'export', 'show:application/pdf']);
  });
});
