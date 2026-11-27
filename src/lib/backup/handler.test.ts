import { createClient } from '@libsql/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { BACKUP_FAILED, createBackupHandler } from './handler';
import { seedCareerData } from './test-seed';

let dir: string;
beforeEach(() => { dir = makeTempDir('teachme-backup-api-'); });
afterEach(() => removeTempDir(dir));

const now = new Date(2026, 10, 15, 14, 5);
const open = (path: string) => createClient({ url: pathToFileURL(path).href, concurrency: 1 });
const local = () => new Request('http://localhost/api/backup');

describe('GET /api/backup', () => {
  it('returns an empty backup for a missing database without creating the file', async () => {
    const path = join(dir, 'career.db');
    const response = await createBackupHandler({ databasePath: () => path, openClient: open, now: () => now }).GET(local());
    expect(response.status).toBe(200);
    expect((await response.json()).counts).toEqual({ cvWorkspaces: 0, cvVersions: 0, applications: 0, practiceQuestions: 0, practiceAttempts: 0, unreadableRows: 0 });
    expect(existsSync(path)).toBe(false);
  });

  it('downloads the data as a dated JSON attachment', async () => {
    const path = join(dir, 'career.db');
    const seed = open(path); await seedCareerData(seed); seed.close();
    const response = await createBackupHandler({ databasePath: () => path, openClient: open, now: () => now }).GET(local());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="teachme-career-backup-2026-11-15.json"');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const text = await response.text();
    expect(text).toContain('\n  "format": "teachme-career-backup"');
    expect(JSON.parse(text).counts.cvWorkspaces).toBe(2);
  });

  it('refuses requests that are not from this computer', async () => {
    const response = await createBackupHandler({ databasePath: () => join(dir, 'career.db'), openClient: open }).GET(new Request('http://example.com/api/backup'));
    expect(response.status).toBe(400);
  });

  it('reports a read failure without details', async () => {
    const path = join(dir, 'career.db');
    const seed = open(path); await seed.execute('SELECT 1'); seed.close();
    const response = await createBackupHandler({ databasePath: () => path, openClient: () => { throw new Error('database is locked'); } }).GET(local());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(BACKUP_FAILED);
  });
});
