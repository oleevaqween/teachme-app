import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fingerprintTables, makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { CAREER_TABLES } from './export';
import { createBackupHandler } from './handler';
import { seedCareerData } from './test-seed';

const md5 = (file: string) => createHash('md5').update(readFileSync(file)).digest('hex');
const open = (path: string) => createClient({ url: pathToFileURL(path).href, concurrency: 1 });
const exportFrom = (path: string) => createBackupHandler({ databasePath: () => path, openClient: open }).GET(new Request('http://localhost/api/backup'));
const fingerprint = async (path: string, tables: readonly string[]) => {
  const client = open(path);
  try { return await fingerprintTables(client, [...tables]); } finally { client.close(); }
};

describe('Career backup data safety', () => {
  it('leaves the file and every career table identical (seeded temp database)', async () => {
    const dir = makeTempDir('teachme-backup-safety-');
    try {
      const path = join(dir, 'career.db');
      const seed = open(path); await seedCareerData(seed); seed.close();
      const fileBefore = md5(path);
      const tablesBefore = await fingerprint(path, CAREER_TABLES);

      const response = await exportFrom(path);
      expect(response.status).toBe(200);
      expect((await response.json()).counts).toEqual({
        cvWorkspaces: 2, cvVersions: 3, applications: 1, practiceQuestions: 1, practiceAttempts: 1, unreadableRows: 0,
      }); // the export really read every table

      expect(md5(path)).toBe(fileBefore);
      expect(await fingerprint(path, CAREER_TABLES)).toBe(tablesBefore);
    } finally {
      removeTempDir(dir);
    }
  });

  it('never adds tables to a database that has none', async () => {
    const dir = makeTempDir('teachme-backup-safety-');
    try {
      const path = join(dir, 'career.db');
      const seed = open(path); await seed.execute('SELECT 1'); seed.close();
      if (!existsSync(path)) writeFileSync(path, ''); // a zero-byte file is a valid empty SQLite database
      expect(existsSync(path)).toBe(true);
      const fileBefore = md5(path);
      const response = await exportFrom(path);
      expect(response.status).toBe(200);
      expect(Object.values((await response.json()).counts).every(n => n === 0)).toBe(true);
      const check = open(path);
      try { expect((await check.execute('SELECT COUNT(*) AS n FROM sqlite_master')).rows[0].n).toBe(0); } finally { check.close(); }
      expect(md5(path)).toBe(fileBefore);
    } finally {
      removeTempDir(dir);
    }
  });

  const realDataCopy = join(process.cwd(), '.integration-data', 'career.db');
  it.skipIf(!existsSync(realDataCopy))('leaves a copy of the real career data identical', async ctx => {
    const originalHash = md5(realDataCopy);
    const dir = makeTempDir('teachme-backup-safety-');
    let total = 0;
    try {
      const path = join(dir, 'career.db');
      copyFileSync(realDataCopy, path);
      const fileBefore = md5(path);
      const response = await exportFrom(path);
      expect(response.status).toBe(200);
      const counts = (await response.json()).counts as Record<string, number>;
      total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      expect(md5(path)).toBe(fileBefore);
    } finally {
      removeTempDir(dir);
    }
    expect(md5(realDataCopy)).toBe(originalHash); // the original was only read
    if (total === 0) ctx.skip('The real-data copy has no career data to export');
  });
});
