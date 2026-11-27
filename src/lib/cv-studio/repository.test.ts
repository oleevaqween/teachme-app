import { createClient } from '@libsql/client';
import { describe, it, expect } from 'vitest';
import { createRepository, ConflictError } from './repository';
import { fixture } from './test-fixture';
import { ensureEvidenceGuide, updateEvidenceAnswer } from './evidence-guide';
import { activeEvidenceGuide } from './evidence-schema';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
describe('Saved CVs and versions', () => {
  it('persists versions, isolates documents and rejects stale writes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'teachme-cv-test-'));
    const client = createClient({ url: pathToFileURL(join(directory, 'test.db')).href });
    try {
      const repo = createRepository(client);
      const w = fixture();
      const saved = await repo.save(w, 0);
      expect(saved.revision).toBe(1);
      await repo.save({ ...w, name: 'Revised' }, 1, 'Rename');
      await expect(repo.save({ ...w, name: 'Stale overwrite' }, 1)).rejects.toBeInstanceOf(ConflictError);
      expect((await repo.get(w.id))?.name).toBe('Revised');
      expect((await repo.versions(w.id)).map(v => v.label)).toContain('Created');
      await repo.save({ ...w, id: 'other', name: 'Independent' }, 0);
      expect((await repo.get(w.id))?.name).toBe('Revised');
      expect((await repo.list()).length).toBe(2);
      let guided = ensureEvidenceGuide({ ...w, analysis: { role: 'Example', company: '', overview: '', requirements: [], suggestions: [], questions: [{ question: 'What did you deliver?', why: 'Clarify scope.' }] } });
      guided = updateEvidenceAnswer(guided, { ...activeEvidenceGuide(guided)!.answers[0], answer: 'Delivered a dashboard.', status: 'answered', attachments: [{ id: 'doc1', name: 'report.txt', text: 'Dashboard delivered.' }] });
      await repo.save(guided, 2, 'Confirmed guided evidence');
      expect((await repo.get(w.id))?.evidenceGuides).toEqual(guided.evidenceGuides);
      expect((await repo.versions(w.id)).find(v => v.label === 'Created')?.workspace.evidenceGuides).toBeUndefined();
      expect((await repo.get('other'))?.evidenceGuides).toBeUndefined();
    } finally {
      client.close();
      // libsql may retain a native file handle until this worker exits on Windows.
      // The operating-system temporary folder owns this disposable fixture.
    }
  });
  it('deletes one application and its checkpoints but never a master CV', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'teachme-cv-delete-test-'));
    const client = createClient({ url: pathToFileURL(join(directory, 'test.db')).href });
    try {
      const repo = createRepository(client);
      const application = fixture();
      const saved = await repo.save(application, 0, 'Created');
      const revised = await repo.save({ ...application, name: 'Revised application' }, saved.revision, 'Before export');
      const master = await repo.save({ ...application, id: 'master', kind: 'master', name: 'Protected master' }, 0, 'Created');
      await expect(repo.removeApplication(master.id, master.revision)).rejects.toThrow('Master CVs are protected');
      await expect(repo.removeApplication(revised.id, revised.revision - 1)).rejects.toBeInstanceOf(ConflictError);
      const removed = await repo.removeApplication(revised.id, revised.revision);
      expect(removed).toEqual({ id: application.id, removedVersions: 2 });
      expect(await repo.get(application.id)).toBeNull();
      expect(await repo.versions(application.id)).toEqual([]);
      expect((await repo.get(master.id))?.kind).toBe('master');
    } finally { client.close(); }
  });
});
