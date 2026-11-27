import { createClient, type Client } from '@libsql/client';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCREENING_TABLE_STATEMENT } from '@/lib/career-db/tables';
import { ConflictError } from '@/lib/cv-studio/repository';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { SCREENING_CONFLICT } from './screening';
import { createScreeningRepository } from './screening-repository';

// Throwaway databases per test; never career.db.
let dir: string;
let clients: Client[];
beforeEach(() => { dir = makeTempDir('teachme-screening-'); clients = []; });
afterEach(() => { for (const c of clients) c.close(); removeTempDir(dir); });
const open = (name = 'career.db') => { const c = createClient({ url: pathToFileURL(join(dir, name)).href }); clients.push(c); return c; };
const definitions = async (c: Client) => (await c.execute("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map(r => [r.type, r.name, r.tbl_name, r.sql]);

const now = new Date('2026-11-18T09:00:00.000Z');

describe('screening repository', () => {
  it('reads empty answers and revision 0 before anything is saved', async () => {
    expect(await createScreeningRepository(open()).get()).toEqual({ answers: {}, revision: 0 });
  });

  it('saves and loads one profile row with a revision', async () => {
    const client = open();
    const repo = createScreeningRepository(client);
    expect(await repo.save({ 'uk-right': 'Yes, British citizen.' }, 0, now)).toEqual({ answers: { 'uk-right': 'Yes, British citizen.' }, revision: 1 });
    await repo.save({ 'uk-right': 'Yes', notice: 'One month' }, 1, now);
    expect(await createScreeningRepository(client).get()).toEqual({ answers: { 'uk-right': 'Yes', notice: 'One month' }, revision: 2 });
    const rows = (await client.execute('SELECT id, body, revision, updated_at FROM screening_profile')).rows;
    expect(rows.map(r => [r.id, JSON.parse(String(r.body)), r.revision, r.updated_at])).toEqual([['me', { answers: { 'uk-right': 'Yes', notice: 'One month' } }, 2, now.toISOString()]]);
  });

  it('refuses a stale revision with the conflict message, writing nothing', async () => {
    const repo = createScreeningRepository(open());
    await repo.save({ salary: 'Open' }, 0, now);
    const error = await repo.save({ salary: 'Changed' }, 0, now).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe(SCREENING_CONFLICT);
    expect((await repo.get()).answers).toEqual({ salary: 'Open' });
  });

  it('refuses unknown questions and over-long answers before writing', async () => {
    const repo = createScreeningRepository(open());
    await expect(repo.save({ salary: 'x'.repeat(501) }, 0, now)).rejects.toThrow('Answers must be 500 characters or fewer.');
    await expect(repo.save({ pets: 'cat' } as never, 0, now)).rejects.toThrow();
    expect(await repo.get()).toEqual({ answers: {}, revision: 0 });
  });

  it('creates only the screening_profile table, exactly as its statement says', async () => {
    const viaRepository = open('repo.db');
    await createScreeningRepository(viaRepository).get();
    const viaStatement = open('statement.db');
    await viaStatement.execute(SCREENING_TABLE_STATEMENT);
    expect(await definitions(viaRepository)).toEqual(await definitions(viaStatement));
    expect((await definitions(viaRepository)).map(d => d[1])).toEqual(['screening_profile']);
    expect(SCREENING_TABLE_STATEMENT).toBe('CREATE TABLE IF NOT EXISTS screening_profile (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  });

  it('reports the original error even when the rollback itself fails', async () => {
    const tx = {
      execute: async () => { throw new Error('original failure'); },
      rollback: async () => { throw new Error('rollback failed'); },
      commit: async () => {},
      close: () => {},
    };
    const stub = { execute: async () => ({ rows: [] }), transaction: async () => tx } as unknown as Client;
    await expect(createScreeningRepository(stub).save({ salary: '60k' }, 0, now)).rejects.toThrow('original failure');
  });
});

describe('damaged screening answers', () => {
  it('opens a damaged body as empty answers with its real revision, writing nothing', async () => {
    const client = open();
    const repo = createScreeningRepository(client);
    await repo.save({ notice: 'One month' }, 0, now);
    await client.execute("UPDATE screening_profile SET body = 'not json' WHERE id = 'me'");
    expect(await repo.get()).toEqual({ answers: {}, revision: 1, unreadable: true });
    expect((await client.execute('SELECT body, revision FROM screening_profile')).rows.map(r => [r.body, r.revision])).toEqual([['not json', 1]]);
    await client.execute(`UPDATE screening_profile SET body = '{"answers":{"pets":"cat"}}' WHERE id = 'me'`);
    expect(await repo.get()).toEqual({ answers: {}, revision: 1, unreadable: true });
  });
});
