import { createClient, type Client } from '@libsql/client';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAREER_TABLE_STATEMENTS, SCREENING_TABLE_STATEMENT } from '@/lib/career-db/tables';
import { createRepository } from '@/lib/cv-studio/repository';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { fingerprintTables, makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { CAREER_TABLES, exportCareerData } from './export';
import { applyRestore, checkRestore, isDamagedDatabase, RestoreChangedError, SafetyCopyError } from './restore';
import { emptyCurrent, parseBackupFile, planRestore, type BackupFile } from './restore-plan';
import { CHANGED, SAFETY_FAILED } from './restore-view';
import { createScreeningRepository } from '@/lib/applications/screening-repository';
import { seedCareerData } from './test-seed';

let dir: string;
let clients: Client[];
beforeEach(() => { dir = makeTempDir('teachme-restore-'); clients = []; });
afterEach(() => { for (const c of clients) if (!c.closed) c.close(); removeTempDir(dir); });

const now = new Date(2026, 10, 16, 15, 30, 5);
const open = (path: string) => { const c = createClient({ url: pathToFileURL(path).href, concurrency: 1 }); clients.push(c); return c; };
const tables = [...CAREER_TABLES];

async function backupOf(path: string): Promise<BackupFile> {
  const reader = open(path);
  const backup = await exportCareerData(reader, now);
  reader.close();
  return parseBackupFile(JSON.stringify(backup));
}
async function rowsById(client: Client, table: string) {
  const result = await client.execute(`SELECT * FROM ${table} ORDER BY id`);
  return result.rows.map(row => result.columns.map(column => row[column]));
}
/** Every row of every career table that exists, in id order. */
async function allRows(client: Client) {
  const present = new Set((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map(r => String(r.name)));
  const out: Record<string, unknown[]> = {};
  for (const table of tables) if (present.has(table)) out[table] = await rowsById(client, table);
  return out;
}
const definitions = async (c: Client) => (await c.execute("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map(r => [r.type, r.name, r.tbl_name, r.sql]);
const options = (extra: Partial<Parameters<typeof applyRestore>[3]> = {}) => ({ databaseExisted: true, safetyDir: join(dir, 'restore-safety'), openClient: open, now, ...extra });

describe('applyRestore', () => {
  it('recovers everything into a new database exactly as it was', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const target = join(dir, 'target.db');
    const fingerprint = planRestore(file, emptyCurrent(), now).fingerprint;
    const result = await applyRestore(open(target), file, fingerprint, options({ databaseExisted: false }));
    expect(result.safetyCopy).toBeNull();
    expect(result.plan.addCount).toBe(8);
    const original = open(source), restored = open(target);
    for (const table of tables) expect(await rowsById(restored, table)).toEqual(await rowsById(original, table));
    expect(await definitions(restored)).toEqual(await definitions(original));
  });

  it('adds nothing the second time', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const before = await fingerprintTables(open(source), tables);
    const plan = await checkRestore(open(source), file, now);
    expect(plan.addCount).toBe(0);
    const result = await applyRestore(open(source), file, plan.fingerprint, options());
    expect(result.plan.addCount).toBe(0);
    expect(await fingerprintTables(open(source), tables)).toBe(before);
  });

  it('makes a verified safety copy before restoring', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const target = join(dir, 'target.db');
    const existing = open(target);
    await createRepository(existing).save({ ...fixture(), id: 'mine', kind: 'master', parentId: null, name: 'My new CV' }, 0);
    const before = await allRows(existing);
    const plan = await checkRestore(open(target), file, now);
    const result = await applyRestore(existing, file, plan.fingerprint, options());
    expect(result.safetyCopy).toBe(join(dir, 'restore-safety', 'career-20261116-153005.db'));
    expect(existsSync(result.safetyCopy!)).toBe(true);
    // VACUUM INTO may renumber hidden rowids, so the copy is compared row by row in id order.
    expect(await allRows(open(result.safetyCopy!))).toEqual(before);
    expect((await createRepository(open(target)).list()).map(w => w.id).sort()).toEqual(['app-1', 'master', 'mine']);
  });

  it("keeps the app's CV and saves the backup copy as a readable version", async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    // An edit saved without a checkpoint is in the backup but in no saved version.
    const repo = createRepository(open(source));
    const first = (await repo.get('master'))!;
    await repo.save({ ...first, name: 'Master CV v2' }, first.revision);
    const file = await backupOf(source);
    const second = (await repo.get('master'))!;
    await repo.save({ ...second, name: 'Master CV (renamed)' }, second.revision);
    const plan = await checkRestore(open(source), file, now);
    expect(plan.addCount).toBe(1);
    await applyRestore(open(source), file, plan.fingerprint, options());
    const after = createRepository(open(source));
    expect((await after.get('master'))!.name).toBe('Master CV (renamed)');
    const versions = await after.versions('master');
    expect(versions.find(v => v.label === 'From backup 16 Nov 2026')!.workspace.name).toBe('Master CV v2');
  });

  it('refuses when the data changed after the check, writing nothing', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const target = join(dir, 'target.db');
    const t = open(target);
    await t.batch([...CAREER_TABLE_STATEMENTS], 'write');
    const plan = await checkRestore(open(target), file, now);
    await createRepository(t).save({ ...fixture(), id: 'master', kind: 'master', parentId: null, name: 'Made meanwhile' }, 0);
    const before = await fingerprintTables(t, tables);
    await expect(applyRestore(t, file, plan.fingerprint, options())).rejects.toThrow(new RestoreChangedError());
    expect(new RestoreChangedError().message).toBe(CHANGED);
    expect(await fingerprintTables(t, tables)).toBe(before);
  });

  it('undoes every addition when one fails part-way', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const target = join(dir, 'target.db');
    const t = open(target);
    await t.batch([...CAREER_TABLE_STATEMENTS], 'write');
    await t.execute("CREATE TRIGGER restore_fails BEFORE INSERT ON practice_attempt BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
    const before = await fingerprintTables(t, tables);
    const plan = await checkRestore(open(target), file, now);
    await expect(applyRestore(t, file, plan.fingerprint, options())).rejects.toThrow('forced failure');
    expect(await fingerprintTables(t, tables)).toBe(before);
  });

  it('restores nothing when the safety copy cannot be made', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const target = join(dir, 'target.db');
    const t = open(target);
    await t.batch([...CAREER_TABLE_STATEMENTS], 'write');
    const before = await fingerprintTables(t, tables);
    const blocker = join(dir, 'not-a-folder');
    writeFileSync(blocker, 'x');
    const plan = await checkRestore(open(target), file, now);
    await expect(applyRestore(t, file, plan.fingerprint, options({ safetyDir: blocker }))).rejects.toThrow(new SafetyCopyError());
    expect(new SafetyCopyError().message).toBe(SAFETY_FAILED);
    expect(await fingerprintTables(t, tables)).toBe(before);
  });
});

describe('safety copies', () => {
  it('keeps only the five newest copies restore made and leaves other files alone', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const safetyDir = join(dir, 'restore-safety');
    mkdirSync(safetyDir);
    const old = ['career-20261101-090000.db', 'career-20261102-090000.db', 'career-20261103-090000.db', 'career-20261104-090000.db', 'career-20261105-090000.db', 'career-20261105-090000-2.db'];
    for (const name of [...old, 'notes.txt', 'career-before-move.db']) writeFileSync(join(safetyDir, name), 'x');
    const plan = await checkRestore(open(source), file, now);
    const result = await applyRestore(open(source), file, plan.fingerprint, options());
    expect(result.safetyCopy).toBe(join(safetyDir, 'career-20261116-153005.db'));
    expect(readdirSync(safetyDir).sort()).toEqual([
      'career-20261103-090000.db', 'career-20261104-090000.db', 'career-20261105-090000-2.db', 'career-20261105-090000.db',
      'career-20261116-153005.db', 'career-before-move.db', 'notes.txt',
    ]);
  });
});

describe('safety copies after a clock change', () => {
  it('always keeps the copy just made, even when older copies have later dates', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const safetyDir = join(dir, 'restore-safety');
    mkdirSync(safetyDir);
    const future = ['career-20991231-000001.db', 'career-20991231-000002.db', 'career-20991231-000003.db', 'career-20991231-000004.db', 'career-20991231-000005.db'];
    for (const name of future) writeFileSync(join(safetyDir, name), 'x');
    const plan = await checkRestore(open(source), file, now);
    const result = await applyRestore(open(source), file, plan.fingerprint, options());
    expect(existsSync(result.safetyCopy!)).toBe(true);
    expect(readdirSync(safetyDir).sort()).toEqual([...future.slice(1), 'career-20261116-153005.db'].sort());
  });
});

describe('a damaged database', () => {
  it('is recognised by its error, and restore refuses before writing anything', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const damaged = join(dir, 'damaged.db');
    writeFileSync(damaged, 'this is not a database '.repeat(200));
    const error = await checkRestore(open(damaged), file, now).catch(e => e);
    expect(isDamagedDatabase(error)).toBe(true);
    const restoreError = await applyRestore(open(damaged), file, 'f'.repeat(64), options()).catch(e => e);
    expect(isDamagedDatabase(restoreError)).toBe(true);
    expect(existsSync(join(dir, 'restore-safety'))).toBe(false);
    expect(isDamagedDatabase(new Error('database is locked'))).toBe(false);
    expect(isDamagedDatabase(new SafetyCopyError())).toBe(false);
  });
});

describe('checkRestore', () => {
  it('reads without writing: the connection is switched to query-only', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const checker = open(source);
    await checkRestore(checker, file, now);
    await expect(checker.execute("INSERT INTO cv_version VALUES ('x', 'y', 'z', '{}', 'now')")).rejects.toThrow();
  });

  it('treats missing tables as empty', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    const empty = open(join(dir, 'empty.db'));
    await empty.execute('SELECT 1');
    expect((await checkRestore(empty, file, now)).addCount).toBe(8);
  });
});

describe('screening answers', () => {
  async function sourceWithProfile() {
    const source = join(dir, 'source.db');
    const seed = open(source);
    await seedCareerData(seed);
    await createScreeningRepository(seed).save({ 'uk-right': 'Yes, British citizen.', notice: 'One month' }, 0, now);
    seed.close();
    return source;
  }

  it('restores them into a database that has none', async () => {
    const file = await backupOf(await sourceWithProfile());
    const target = join(dir, 'target.db');
    const plan = planRestore(file, emptyCurrent(), now);
    expect(plan.addCount).toBe(9);
    await applyRestore(open(target), file, plan.fingerprint, options({ databaseExisted: false }));
    expect(await createScreeningRepository(open(target)).get()).toEqual({ answers: { 'uk-right': 'Yes, British citizen.', notice: 'One month' }, revision: 1 });
  });

  it('adds them when the table exists but holds no row', async () => {
    const file = await backupOf(await sourceWithProfile());
    const target = join(dir, 'target.db');
    const t = open(target);
    await t.execute(SCREENING_TABLE_STATEMENT);
    const plan = await checkRestore(open(target), file, now);
    expect(plan.screeningProfile).toBe('add');
    await applyRestore(t, file, plan.fingerprint, options());
    expect((await createScreeningRepository(open(target)).get())?.answers).toEqual({ 'uk-right': 'Yes, British citizen.', notice: 'One month' });
  });

  it('never changes answers the app already has', async () => {
    const file = await backupOf(await sourceWithProfile());
    const target = join(dir, 'target.db');
    const t = open(target);
    await createScreeningRepository(t).save({ 'uk-right': 'No' }, 0, now);
    const plan = await checkRestore(open(target), file, now);
    expect(plan.screeningProfile).toBe('kept');
    await applyRestore(t, file, plan.fingerprint, options());
    expect(await createScreeningRepository(open(target)).get()).toEqual({ answers: { 'uk-right': 'No' }, revision: 1 });
  });

  it('restores an older backup without answers exactly as before, adding no table', async () => {
    const source = join(dir, 'source.db');
    const seed = open(source); await seedCareerData(seed); seed.close();
    const file = await backupOf(source);
    expect(file).not.toHaveProperty('screeningProfile');
    const target = join(dir, 'target.db');
    const plan = planRestore(file, emptyCurrent(), now);
    expect([plan.screeningProfile, plan.addCount]).toEqual([null, 8]);
    await applyRestore(open(target), file, plan.fingerprint, options({ databaseExisted: false }));
    const names = (await open(target).execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map(r => String(r.name));
    expect(names).not.toContain('screening_profile');
  });
});
