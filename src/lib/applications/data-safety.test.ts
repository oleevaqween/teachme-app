import { createClient, type Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRepository } from '@/lib/cv-studio/repository';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { fingerprintTables, makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { createApplicationHandlers } from './handlers';
import { createApplicationRepository } from './repository';
import { blankApplicationInput, toInput } from './schema';
import { sentFinder, versionLabelReader } from './sent';

/** Fingerprint of every CV Studio row plus the definitions of its tables and indexes. */
const cvFingerprint = (client: Client) => fingerprintTables(client, ['cv_workspace', 'cv_version']);

const md5 = (file: string) => createHash('md5').update(readFileSync(file)).digest('hex');
const tempDir = () => makeTempDir('teachme-tracker-safety-');

/** Runs every tracker operation: list, create, update, link, unlink and delete (including a linked entry). */
async function exerciseTracker(client: Client, linkId?: string) {
  const cv = createRepository(client);
  const tracker = createApplicationRepository(client);
  const versions = versionLabelReader(client);
  const findSent = sentFinder(versions);
  const handlers = createApplicationHandlers({ applications: tracker, workspaces: () => cv.listReadable(), versions });
  expect((await handlers.GET(new Request('http://localhost/api/applications'))).status).toBe(200);
  const applicationCvs = (await cv.listReadable()).workspaces.filter(w => w.kind === 'application');

  let outside = await tracker.create(blankApplicationInput({ company: 'Outside Co', role: 'Delivery Lead' }));
  outside = await tracker.update(outside.id, { ...toInput(outside), status: 'interviewing', notes: 'Phone screen booked' }, outside.revision);

  let sentCv: unknown;
  const first = applicationCvs.find(w => w.id === linkId) ?? applicationCvs[0];
  if (first) {
    const linked = await tracker.create(blankApplicationInput({ workspaceId: first.id, company: 'Linked Co', role: 'Project Manager', status: 'preparing' }));
    const applied = await tracker.update(linked.id, { ...toInput(linked), status: 'applied' }, linked.revision, new Date(), findSent);
    expect(applied.sent?.failed).toBeUndefined();
    sentCv = applied.sent?.cv;
    const refreshed = await tracker.refreshSent(applied.id, applied.revision, findSent);
    await tracker.remove(refreshed.id, refreshed.revision);
  }
  if (applicationCvs[1]) {
    outside = await tracker.update(outside.id, { ...toInput(outside), workspaceId: applicationCvs[1].id }, outside.revision);
    outside = await tracker.update(outside.id, { ...toInput(outside), workspaceId: null }, outside.revision);
  }
  await tracker.remove(outside.id, outside.revision);
  return { cv, applicationCvs, sentCv };
}

describe('Application tracker data safety', () => {
  it('leaves every CV Studio row and table definition untouched (seeded temp database)', async () => {
    const dir = tempDir();
    const client = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
    try {
      const cv = createRepository(client);
      await cv.save({ ...fixture(), id: 'master', kind: 'master', parentId: null, name: 'Master CV' }, 0);
      await cv.save({ ...fixture(), id: 'app-1', name: 'Acme PM' }, 0);
      await cv.save({ ...fixture(), id: 'app-1', name: 'Acme PM (edited)' }, 1, 'Edited');
      await cv.save({ ...fixture(), id: 'app-1', name: 'Acme PM (edited)' }, 2, 'Exported cv PDF');
      await cv.save({ ...fixture(), id: 'app-2', name: 'Globex Lead' }, 0);
      const before = await cvFingerprint(client);

      const { applicationCvs, sentCv } = await exerciseTracker(client, 'app-1');

      // The seeded "Exported cv PDF" version was really found, not just a lookup that did not fail.
      expect(sentCv).toMatchObject({ label: 'Exported cv PDF' });

      expect(applicationCvs).toHaveLength(2);
      expect(await cvFingerprint(client)).toBe(before);
      expect(await cv.get('app-1')).not.toBeNull();
      expect(await cv.get('app-2')).not.toBeNull();
    } finally {
      client.close();
      removeTempDir(dir);
    }
  });

  const realDataCopy = join(process.cwd(), '.integration-data', 'career.db');
  it.skipIf(!existsSync(realDataCopy))('leaves a copy of the real CV data untouched', async () => {
    const originalHash = md5(realDataCopy);
    const dir = tempDir();
    const copy = join(dir, 'career.db');
    copyFileSync(realDataCopy, copy);
    const client = createClient({ url: pathToFileURL(copy).href });
    try {
      await createRepository(client).listReadable(); // CV Studio's own start-up step, before fingerprinting
      const before = await cvFingerprint(client);
      await exerciseTracker(client);
      expect(await cvFingerprint(client)).toBe(before);
    } finally {
      client.close();
      removeTempDir(dir);
    }
    expect(md5(realDataCopy)).toBe(originalHash); // the original file was only read
  });
});
