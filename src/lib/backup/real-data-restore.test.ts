import { createClient, type Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync } from 'node:fs';
import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { CAREER_TABLES, exportCareerData } from './export';
import { applyRestore } from './restore';
import { emptyCurrent, parseBackupFile, planRestore } from './restore-plan';

/**
 * Opt-in: RESTORE_REAL_DB is an absolute path to a COPY of the real career database.
 * The file is copied once into a private temp directory; the original path is never opened
 * by libsql. The private copy is exported, restored into an empty temporary database and
 * compared table by table using per-row hashes, so a failing assertion never prints CV text.
 * Only counts are printed.
 */
const source = process.env.RESTORE_REAL_DB;

const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe.skipIf(!source)('real career data restores exactly', () => {
  it('restores every row of a copy of the real database into an empty one', async () => {
    if (!existsSync(source!)) throw new Error('RESTORE_REAL_DB does not exist: ' + source);
    if (source!.replace(/\\/g, '/').endsWith('/.data/career.db') || path.resolve(source!).startsWith(path.resolve('.'))) throw new Error('Point RESTORE_REAL_DB at a temporary copy, never the live database.');
    const dir = makeTempDir('teachme-real-restore-');
    const clients: Client[] = [];
    const open = (p: string) => { const c = createClient({ url: pathToFileURL(p).href, concurrency: 1 }); clients.push(c); return c; };
    try {
      // Private scratch copy of the main file only; everything below runs against it.
      const privateCopy = join(dir, 'source.db');
      copyFileSync(source!, privateCopy);
      const original = open(privateCopy);
      const file = parseBackupFile(JSON.stringify(await exportCareerData(original)));
      const plan = planRestore(file, emptyCurrent(), new Date());
      const { plan: done } = await applyRestore(open(join(dir, 'restored.db')), file, plan.fingerprint, { databaseExisted: false, safetyDir: join(dir, 'restore-safety'), openClient: open });
      const restored = open(join(dir, 'restored.db'));

      const tablesIn = async (c: Client) => {
        const r = await c.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
        const names = new Set(r.rows.map(row => String(row.name)));
        return new Set(CAREER_TABLES.filter(t => names.has(t)));
      };
      const sourceTables = await tablesIn(original);
      const restoredTables = await tablesIn(restored);
      // applyRestore always creates all five tables, so the restored set may be larger than the source's.
      for (const table of sourceTables) expect(restoredTables.has(table), 'missing table ' + table).toBe(true);
      for (const table of restoredTables) {
        if (sourceTables.has(table)) continue;
        const count = Number((await restored.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n ?? 0);
        expect(count, 'extra table ' + table + ' should be empty').toBe(0);
      }

      const digest = async (c: Client, table: string) => {
        const r = await c.execute(`SELECT * FROM ${table} ORDER BY id`);
        return {
          columns: [...r.columns],
          rows: r.rows.map(row => [String(row.id), sha256(r.columns.map(col => row[col]))]),
        };
      };
      for (const table of sourceTables) {
        const a = await digest(restored, table);
        const b = await digest(original, table);
        expect(a.columns, 'columns differ in ' + table).toEqual(b.columns);
        expect(a.rows, 'row hashes differ in ' + table).toEqual(b.rows);
      }
      console.log('restored', done.addCount, 'items; skipped', done.items.filter(i => i.outcome === 'skip').length);
    } finally {
      for (const c of clients) if (!c.closed) c.close();
      removeTempDir(dir);
    }
  }, 120000);
});
