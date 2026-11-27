import { describe, expect, it } from 'vitest';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { WorkspaceSchema } from './schema';
import { missingLines, readQuality } from './import-diagnosis';

/**
 * Real-data probe for the import check, run by hand before the preview; skipped unless IMPORT_PROBE_DB is set.
 * IMPORT_PROBE_DB: absolute path to a COPY of the career database outside the project, never the live file.
 * The copy is opened read-only (query_only) and nothing is written. Results are printed for a person to review;
 * the test fails only when no master CV has import text to check.
 */
const dbPath = process.env.IMPORT_PROBE_DB;
// realpath expands Windows short names (USERNA~1) so the project check cannot be sidestepped.
const slashes = (p: string) => realpathSync.native(path.resolve(p)).replace(/\\/g, '/').toLowerCase();

describe.skipIf(!dbPath)('import check on real import text (copy of the career database)', () => {
  it('prints readQuality and missingLines for every master CV with import text', async () => {
    if (!existsSync(dbPath!)) throw new Error('IMPORT_PROBE_DB does not exist: ' + dbPath);
    const target = slashes(dbPath!);
    if (target.endsWith('/.data/career.db') || target.endsWith('/dev.db') || target.startsWith(slashes('.') + '/')) {
      throw new Error('Point IMPORT_PROBE_DB at a temporary copy outside the project, never the live database.');
    }
    const client = createClient({ url: 'file:' + dbPath, concurrency: 1 });
    try {
      await client.execute('PRAGMA query_only = ON');
      const rows = (await client.execute('SELECT id, body FROM cv_workspace ORDER BY id')).rows;
      let checked = 0;
      for (const row of rows) {
        const parsed = WorkspaceSchema.safeParse(JSON.parse(String(row.body)));
        // Masters only: applications inherit the import text but their resume is tailored, so every cut would look missing.
        if (!parsed.success || parsed.data.kind !== 'master' || !parsed.data.importSource?.trim()) continue;
        const w = parsed.data;
        const source = w.importSource!;
        checked++;
        // The original file type is not stored, so the scanned-PDF check cannot run here; the other four do.
        const issues = readQuality(source, { kind: 'text' });
        // The resume may have been edited since import, so a listed line can be a deliberate removal, not a false alarm.
        const missing = missingLines(source, w.resume);
        console.log([
          `Master CV ${String(row.id)} (${w.name})`,
          `  Read issues: ${issues.length ? issues.map(issue => issue.title).join('; ') : 'none (read cleanly)'}`,
          `  Possibly missing (${missing.lines.length + missing.more}):`,
          ...missing.lines.map(line => '    - ' + line),
          ...(missing.more ? [`    and ${missing.more} more`] : []),
        ].join('\n'));
      }
      console.log(`Checked ${checked} master CV(s) with import text out of ${rows.length} workspace(s).`);
      expect(checked).toBeGreaterThan(0);
    } finally {
      client.close();
    }
  });
});
