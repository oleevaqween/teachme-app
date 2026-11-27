import { describe, expect, it } from 'vitest';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { WorkspaceSchema } from './schema';
import { editFlags } from './edit-safety';

/**
 * Real-data probe for the tailoring edit check, run by hand before the preview; skipped unless EDIT_SAFETY_PROBE_DB is set.
 * EDIT_SAFETY_PROBE_DB: absolute path to a COPY of the career database outside the project, never the live file.
 * The copy is opened read-only (query_only) and nothing is written. Results are printed for a person to review;
 * the test fails only when no saved tailoring suggestion is found.
 */
const dbPath = process.env.EDIT_SAFETY_PROBE_DB;
// realpath expands Windows short names (USERNA~1) so the project check cannot be sidestepped.
const slashes = (p: string) => realpathSync.native(path.resolve(p)).replace(/\\/g, '/').toLowerCase();
const short = (text: string) => JSON.stringify(text.length > 160 ? text.slice(0, 157) + '...' : text);

describe.skipIf(!dbPath)('edit check on saved tailoring suggestions (copy of the career database)', () => {
  it('prints editFlags for every saved tailoring suggestion', async () => {
    if (!existsSync(dbPath!)) throw new Error('EDIT_SAFETY_PROBE_DB does not exist: ' + dbPath);
    const target = slashes(dbPath!);
    if (target.endsWith('/.data/career.db') || target.endsWith('/dev.db') || target.startsWith(slashes('.') + '/')) {
      throw new Error('Point EDIT_SAFETY_PROBE_DB at a temporary copy outside the project, never the live database.');
    }
    const client = createClient({ url: 'file:' + dbPath, concurrency: 1 });
    try {
      await client.execute('PRAGMA query_only = ON');
      const rows = (await client.execute('SELECT id, body FROM cv_workspace ORDER BY id')).rows;
      let checked = 0, flagged = 0, failed = 0;
      const byRule = new Map<string, number>();
      for (const row of rows) {
        const parsed = WorkspaceSchema.safeParse(JSON.parse(String(row.body)));
        if (!parsed.success || !parsed.data.analysis?.suggestions.length) continue;
        const w = parsed.data;
        const lines = [`Workspace ${String(row.id)} (${w.name}, ${w.kind})`];
        for (const s of w.analysis!.suggestions) {
          checked++;
          let flags: string[];
          try { flags = editFlags(s); } catch (e) {
            // Shown in the app as "Change check unavailable."; listed here so it can be investigated.
            failed++; lines.push(`  ${s.id} [${s.status}] ${s.target}: CHECK FAILED (${e instanceof Error ? e.message : String(e)})`); continue;
          }
          if (flags.length) flagged++;
          // Counted per rule, and per qualifier for "Drops", so a word that alarms often stands out.
          for (const flag of flags) { const rule = flag.startsWith('Drops') ? flag.slice(0, flag.indexOf(' from')) : flag.split(':')[0]; byRule.set(rule, (byRule.get(rule) ?? 0) + 1); }
          lines.push(`  ${s.id} [${s.status}] ${s.target}: ${flags.length ? 'FLAGGED' : 'clean'}`, `    before: ${short(s.before)}`, `    after:  ${short(s.after)}`,
            `    evidence: ${short(s.evidence.map(e => e.quote).join(' | '))}`, ...flags.map(flag => '    - ' + flag));
        }
        console.log(lines.join('\n'));
      }
      console.log(`Checked ${checked} saved tailoring suggestion(s) in ${rows.length} workspace(s): ${flagged} flagged, ${failed} check failure(s).`);
      console.log('Flags by rule: ' + ([...byRule].map(([rule, n]) => `${rule}: ${n}`).join('; ') || 'none'));
      expect(checked).toBeGreaterThan(0);
    } finally {
      client.close();
    }
  });
});
