import { createClient, type Client } from '@libsql/client';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CV_STUDIO_TABLE_STATEMENTS } from '@/lib/career-db/tables';
import { fingerprintTables, makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { sentFinder, versionLabelReader, type VersionLabel } from './sent';

// Throwaway database per test; never career.db.
let dir: string;
let client: Client;
beforeEach(() => {
  dir = makeTempDir('teachme-sent-');
  client = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
});
afterEach(() => { client.close(); removeTempDir(dir); });

const now = new Date('2026-11-18T09:00:00.000Z');
const v = (id: string, label: string, createdAt: string): VersionLabel => ({ id, label, createdAt });

describe('sentFinder', () => {
  it('picks the newest CV and letter downloads, by their exact label prefixes only', async () => {
    const find = sentFinder(async () => [
      v('e1', 'Edited', '2026-11-18T08:00:00.000Z'),
      v('x1', 'Exported cvPDF', '2026-11-18T07:00:00.000Z'),
      v('x2', 'exported cv PDF', '2026-11-18T07:00:00.000Z'),
      v('c2', 'Exported cv DOCX', '2026-11-17T12:00:00.000Z'),
      v('l1', 'Exported letter PDF', '2026-11-16T12:00:00.000Z'),
      v('c1', 'Exported cv PDF', '2026-11-10T12:00:00.000Z'),
    ]);
    expect(await find('cv-1', now)).toEqual({
      cv: { versionId: 'c2', label: 'Exported cv DOCX', at: '2026-11-17T12:00:00.000Z' },
      letter: { versionId: 'l1', label: 'Exported letter PDF', at: '2026-11-16T12:00:00.000Z' },
      checkedAt: now.toISOString(),
    });
  });

  it('cuts a very long label and version id to the stored maximum of 200 characters', async () => {
    const find = sentFinder(async () => [v('i'.repeat(300), 'Exported cv ' + 'x'.repeat(288), '2026-11-17T12:00:00.000Z')]);
    const sent = await find('cv-1', now);
    expect(sent.cv?.label).toHaveLength(200);
    expect(sent.cv?.versionId).toHaveLength(200);
  });

  it('records none found, and records a failed read instead of throwing', async () => {
    expect(await sentFinder(async () => [v('a', 'Created', '2026-11-01T00:00:00.000Z')])('cv-1', now)).toEqual({ checkedAt: now.toISOString() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await sentFinder(async () => { throw new Error('locked'); })('cv-1', now)).toEqual({ checkedAt: now.toISOString(), failed: true });
    warn.mockRestore();
  });
});

describe('versionLabelReader', () => {
  it("reads one CV's version labels newest first and changes nothing", async () => {
    await client.batch([...CV_STUDIO_TABLE_STATEMENTS], 'write');
    const add = (id: string, workspaceId: string, label: string, at: string) =>
      client.execute({ sql: 'INSERT INTO cv_version VALUES (?, ?, ?, ?, ?)', args: [id, workspaceId, label, '{"not":"a workspace"}', at] });
    await add('a', 'cv-1', 'Created', '2026-11-01T00:00:00.000Z');
    await add('b', 'cv-1', 'Exported cv PDF', '2026-11-17T12:00:00.000Z');
    await add('c', 'cv-2', 'Exported cv PDF', '2026-11-18T00:00:00.000Z');
    const before = await fingerprintTables(client, ['cv_workspace', 'cv_version']);
    expect(await versionLabelReader(client)('cv-1')).toEqual([v('b', 'Exported cv PDF', '2026-11-17T12:00:00.000Z'), v('a', 'Created', '2026-11-01T00:00:00.000Z')]);
    expect(await fingerprintTables(client, ['cv_workspace', 'cv_version'])).toBe(before);
  });

  it('reads a database without CV tables as having no versions, and adds no table', async () => {
    expect(await versionLabelReader(client)('cv-1')).toEqual([]);
    expect((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows).toHaveLength(0);
  });
});
