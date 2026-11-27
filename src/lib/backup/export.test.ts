import { createClient, type Client } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { BACKUP_FORMAT, BACKUP_VERSION, exportCareerData } from './export';
import { createScreeningRepository } from '@/lib/applications/screening-repository';
import { seedCareerData } from './test-seed';

// Throwaway database per test; never career.db.
let dir: string;
let client: Client;
beforeEach(() => {
  dir = makeTempDir('teachme-backup-export-');
  client = createClient({ url: pathToFileURL(join(dir, 'career.db')).href, concurrency: 1 });
});
afterEach(() => { client.close(); removeTempDir(dir); });

const now = new Date('2026-11-15T14:05:00.000Z');

describe('exportCareerData', () => {
  it('exports every row of all five tables with counts', async () => {
    await seedCareerData(client);
    const backup = await exportCareerData(client, now);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString() });
    expect(backup.counts).toEqual({ cvWorkspaces: 2, cvVersions: 3, applications: 1, practiceQuestions: 1, practiceAttempts: 1, unreadableRows: 0 });
    expect(backup.cvWorkspaces.map(w => w.id).sort()).toEqual(['app-1', 'master']);
    expect(backup.cvWorkspaces[0]).toEqual(expect.objectContaining({ revision: expect.any(Number), updatedAt: expect.any(String) }));
    expect((backup.cvWorkspaces.find(w => w.id === 'app-1')!.body as { name: string }).name).toBe('Acme PM (edited)');
    expect(backup.cvVersions.every(v => typeof v.label === 'string' && typeof v.workspaceId === 'string')).toBe(true);
    expect(backup.applications[0]).toMatchObject({ workspaceId: 'app-1', revision: 1 });
    expect((backup.applications[0].body as { company: string }).company).toBe('Acme');
    expect(backup.practiceQuestions[0]).toMatchObject({ workspaceId: 'app-1' });
    expect(backup.practiceAttempts[0]).toMatchObject({ workspaceId: 'app-1', questionKey: expect.stringMatching(/^pack:/) });
  });

  it('treats missing tables as empty and never adds tables', async () => {
    await client.execute('SELECT 1');
    const backup = await exportCareerData(client, now);
    expect(backup.counts).toEqual({ cvWorkspaces: 0, cvVersions: 0, applications: 0, practiceQuestions: 0, practiceAttempts: 0, unreadableRows: 0 });
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
    expect(tables.rows).toHaveLength(0);
  });

  it('keeps unreadable bodies as raw text and counts them', async () => {
    await seedCareerData(client);
    const writer = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
    await writer.execute({ sql: 'INSERT INTO job_application (id, workspace_id, body, revision, updated_at) VALUES (?, ?, ?, ?, ?)', args: ['broken', null, '{not json', 1, '2026-11-15T15:00:00.000Z'] });
    writer.close();
    const backup = await exportCareerData(client, now);
    const broken = backup.applications.find(a => a.id === 'broken')!;
    expect(broken).toMatchObject({ body: '{not json', bodyUnreadable: true, workspaceId: null });
    expect(backup.counts.unreadableRows).toBe(1);
  });

  it('leaves the export connection unable to write', async () => {
    await seedCareerData(client);
    await exportCareerData(client, now);
    await expect(client.execute("INSERT INTO job_application (id, workspace_id, body, revision, updated_at) VALUES ('x', NULL, '{}', 1, 'now')")).rejects.toThrow(/readonly/i);
    await expect(client.execute('CREATE TABLE sneaky (id TEXT)')).rejects.toThrow(/readonly/i);
  });

  it('stays read-only on every statement of a single-connection client, even while a second writer is open', async () => {
    const writer = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
    await seedCareerData(writer);
    await exportCareerData(client);
    for (let i = 0; i < 5; i++) {
      await expect(client.execute(`CREATE TABLE sneaky_${i} (id TEXT)`)).rejects.toThrow(/readonly/i);
    }
    const tables = await writer.execute("SELECT name FROM sqlite_master WHERE name LIKE 'sneaky%'");
    expect(tables.rows).toHaveLength(0);
    writer.close();
  });

  it('contains only SELECT statements apart from the query_only switch', () => {
    const raw = readFileSync(join(process.cwd(), 'src/lib/backup/export.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace("'PRAGMA query_only = ON'", '');
    const writeWords = /\b(insert|update|delete|create|drop|alter|replace|pragma|attach|vacuum)\b|\.transaction\(/i;
    // positive control: the scan must catch a write and ignore column names such as created_at
    expect('DELETE FROM cv_workspace').toMatch(writeWords);
    expect('SELECT created_at, updated_at FROM cv_version').not.toMatch(writeWords);
    expect(code).not.toMatch(writeWords);
  });

  it('orders rows by time then id, not insertion or id order', async () => {
    const writer = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
    await writer.execute('CREATE TABLE practice_question (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL)');
    const add = (id: string, at: string) => writer.execute({ sql: 'INSERT INTO practice_question (id, workspace_id, created_at, body) VALUES (?, ?, ?, ?)', args: [id, 'w', at, '{}'] });
    await add('a', '2026-11-15T12:00:00.000Z');
    await add('c', '2026-11-15T09:00:00.000Z');
    await add('b', '2026-11-15T09:00:00.000Z');
    writer.close();
    const backup = await exportCareerData(client, now);
    expect(backup.practiceQuestions.map(q => q.id)).toEqual(['b', 'c', 'a']);
  });

  it('maps each list to its own table when only some tables exist', async () => {
    const writer = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
    await writer.execute('CREATE TABLE cv_workspace (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
    await writer.execute('CREATE TABLE practice_attempt (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, question_key TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)');
    await writer.execute({ sql: 'INSERT INTO cv_workspace (id, body, revision, updated_at) VALUES (?, ?, ?, ?)', args: ['ws', '{"n":1}', 3, '2026-11-15T09:00:00.000Z'] });
    await writer.execute({ sql: 'INSERT INTO practice_attempt (id, workspace_id, question_key, body, created_at) VALUES (?, ?, ?, ?, ?)', args: ['at', 'ws', 'pack:x', '{}', '2026-11-15T10:00:00.000Z'] });
    writer.close();
    const backup = await exportCareerData(client, now);
    expect(backup.counts).toEqual({ cvWorkspaces: 1, cvVersions: 0, applications: 0, practiceQuestions: 0, practiceAttempts: 1, unreadableRows: 0 });
    expect(backup.cvWorkspaces[0]).toMatchObject({ id: 'ws', revision: 3, body: { n: 1 } });
    expect(backup.practiceAttempts[0]).toMatchObject({ id: 'at', questionKey: 'pack:x' });
    expect(backup.cvVersions).toEqual([]);
    expect(backup.applications).toEqual([]);
    expect(backup.practiceQuestions).toEqual([]);
  });
});

describe('screening answers in the export', () => {
  it('includes them only when the app has some, without changing the counts', async () => {
    const writer = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
    await seedCareerData(writer);
    expect(await exportCareerData(client, now)).not.toHaveProperty('screeningProfile');
    await createScreeningRepository(writer).save({ 'uk-right': 'Yes, British citizen.' }, 0, now);
    writer.close();
    const backup = await exportCareerData(client, now);
    expect(backup.screeningProfile).toEqual({ revision: 1, updatedAt: now.toISOString(), body: { answers: { 'uk-right': 'Yes, British citizen.' } } });
    expect(backup.counts).toEqual({ cvWorkspaces: 2, cvVersions: 3, applications: 1, practiceQuestions: 1, practiceAttempts: 1, unreadableRows: 0 });
  });
});
