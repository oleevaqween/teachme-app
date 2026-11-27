import { createClient } from '@libsql/client';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { exportCareerData } from './export';
import { createRestoreHandler } from './restore-handler';
import { CHANGED, damagedMessage, MISSING_FINGERPRINT, NOT_BACKUP, RESTORE_FAILED, SAFETY_FAILED, TOO_LARGE, UNKNOWN_ACTION, type RestoreResultView, type RestoreView } from './restore-view';
import { createScreeningRepository } from '@/lib/applications/screening-repository';
import { seedCareerData } from './test-seed';

let dir: string;
beforeEach(() => { dir = makeTempDir('teachme-restore-api-'); });
afterEach(() => removeTempDir(dir));

const now = new Date(2026, 10, 16, 15, 30, 5);
const open = (path: string) => createClient({ url: pathToFileURL(path).href, concurrency: 1 });
const post = (query: string, body: string) => new Request('http://localhost/api/backup/restore' + query, { method: 'POST', body });

async function seededBackup(): Promise<string> {
  const path = join(dir, 'source.db');
  const seed = open(path); await seedCareerData(seed); seed.close();
  const reader = open(path);
  try { return JSON.stringify(await exportCareerData(reader, now)); } finally { reader.close(); }
}

describe('POST /api/backup/restore', () => {
  it('checks a file against a missing database without creating it', async () => {
    const target = join(dir, 'career.db');
    const handler = createRestoreHandler({ databasePath: () => target, openClient: open, now: () => now });
    const response = await handler.POST(post('?action=check', await seededBackup()));
    expect(response.status).toBe(200);
    const view = await response.json() as RestoreView;
    expect(view.addCount).toBe(8);
    expect(view.summary.cvWorkspaces).toEqual({ inFile: 2, added: 2, same: 0, kept: 0, skipped: 0 });
    expect(view.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(target)).toBe(false);
  });

  it('restores after a check, with no safety copy for a new database, and then has nothing to add', async () => {
    const target = join(dir, 'career.db');
    const handler = createRestoreHandler({ databasePath: () => target, openClient: open, now: () => now });
    const text = await seededBackup();
    const view = await (await handler.POST(post('?action=check', text))).json() as RestoreView;
    const response = await handler.POST(post(`?action=restore&fingerprint=${view.fingerprint}`, text));
    expect(response.status).toBe(200);
    const result = await response.json() as RestoreResultView;
    expect(result).toMatchObject({ addCount: 8, safetyCopy: null });
    const again = await (await handler.POST(post('?action=check', text))).json() as RestoreView;
    expect(again.addCount).toBe(0);
  });

  it('takes a safety copy next to an existing database', async () => {
    const target = join(dir, 'career.db');
    const existing = open(target); await existing.execute('SELECT 1'); existing.close();
    const handler = createRestoreHandler({ databasePath: () => target, openClient: open, now: () => now });
    const text = await seededBackup();
    const view = await (await handler.POST(post('?action=check', text))).json() as RestoreView;
    const result = await (await handler.POST(post(`?action=restore&fingerprint=${view.fingerprint}`, text))).json() as RestoreResultView;
    expect(result.safetyCopy).toBe(join(dir, 'restore-safety', 'career-20261116-153005.db'));
    expect(readdirSync(join(dir, 'restore-safety'))).toEqual(['career-20261116-153005.db']);
  });

  it('restores into a data folder that does not exist yet', async () => {
    const target = join(dir, 'missing folder', '.data', 'career.db');
    const handler = createRestoreHandler({ databasePath: () => target, openClient: open, now: () => now });
    const text = await seededBackup();
    const checked = await handler.POST(post('?action=check', text));
    expect(checked.status).toBe(200);
    const view = await checked.json() as RestoreView;
    expect(view.addCount).toBe(8);
    expect(existsSync(join(dir, 'missing folder'))).toBe(false);
    const response = await handler.POST(post(`?action=restore&fingerprint=${view.fingerprint}`, text));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ addCount: 8, safetyCopy: null });
  });

  it('maps a failed safety copy to 500 with the safety message', async () => {
    const target = join(dir, 'career.db');
    const existing = open(target); await existing.execute('SELECT 1'); existing.close();
    writeFileSync(join(dir, 'restore-safety'), 'not a folder');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const handler = createRestoreHandler({ databasePath: () => target, openClient: open, now: () => now });
      const text = await seededBackup();
      const view = await (await handler.POST(post('?action=check', text))).json() as RestoreView;
      const response = await handler.POST(post(`?action=restore&fingerprint=${view.fingerprint}`, text));
      expect(response.status).toBe(500);
      expect((await response.json()).error).toBe(SAFETY_FAILED);
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses a stale fingerprint with 409', async () => {
    const handler = createRestoreHandler({ databasePath: () => join(dir, 'career.db'), openClient: open, now: () => now });
    const response = await handler.POST(post(`?action=restore&fingerprint=${'0'.repeat(64)}`, await seededBackup()));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(CHANGED);
  });

  it.each([
    ['an unknown action', '?action=delete', 'x', UNKNOWN_ACTION],
    ['a restore without a fingerprint', '?action=restore', 'x', MISSING_FINGERPRINT],
    ['a file that is not a backup', '?action=check', '{"hello":1}', NOT_BACKUP],
  ])('refuses %s with 400', async (_, query, body, message) => {
    const handler = createRestoreHandler({ databasePath: () => join(dir, 'career.db'), openClient: open });
    const response = await handler.POST(post(query, body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(message);
  });

  it('refuses a file over the size limit', async () => {
    const handler = createRestoreHandler({ databasePath: () => join(dir, 'career.db'), openClient: open, maxBytes: 100 });
    const response = await handler.POST(post('?action=check', await seededBackup()));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(TOO_LARGE);
  });

  it('refuses requests that are not from this computer', async () => {
    const handler = createRestoreHandler({ databasePath: () => join(dir, 'career.db'), openClient: open });
    const response = await handler.POST(new Request('http://example.com/api/backup/restore?action=check', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(400);
  });

  it('reports a database failure without details', async () => {
    const handler = createRestoreHandler({ databasePath: () => join(dir, 'career.db'), openClient: () => { throw new Error('database is locked'); } });
    const response = await handler.POST(post(`?action=restore&fingerprint=${'a'.repeat(64)}`, await seededBackup()));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(RESTORE_FAILED);
  });

  it('explains how to set a damaged database aside, for both check and restore', async () => {
    const target = join(dir, 'career.db');
    writeFileSync(target, 'this is not a database '.repeat(200));
    const handler = createRestoreHandler({ databasePath: () => target, openClient: open, now: () => now });
    const text = await seededBackup();
    const check = await handler.POST(post('?action=check', text));
    expect(check.status).toBe(500);
    expect((await check.json()).error).toBe(damagedMessage(target));
    const restore = await handler.POST(post(`?action=restore&fingerprint=${'a'.repeat(64)}`, text));
    expect(restore.status).toBe(500);
    expect((await restore.json()).error).toBe(damagedMessage(target));
    expect(damagedMessage(target)).toContain('career-damaged.db');
    expect(damagedMessage(target)).toContain(target);
  });

  it('says when the screening answers will be and were added', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source);
    await seedCareerData(seed);
    await createScreeningRepository(seed).save({ notice: 'Two weeks' }, 0, now);
    seed.close();
    const reader = open(source);
    const text = JSON.stringify(await exportCareerData(reader, now));
    reader.close();
    const target = join(dir, 'career.db');
    const handler = createRestoreHandler({ databasePath: () => target, openClient: open, now: () => now });
    const view = await (await handler.POST(post('?action=check', text))).json() as RestoreView;
    expect(view.screeningProfile).toBe('add');
    const result = await (await handler.POST(post(`?action=restore&fingerprint=${view.fingerprint}`, text))).json() as RestoreResultView;
    expect(result).toMatchObject({ addCount: 9, screeningProfileAdded: true });
  });
});
