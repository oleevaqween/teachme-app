import type { Client } from '@libsql/client';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/** Fingerprint of every row of the given tables plus their table and index definitions. */
export async function fingerprintTables(client: Client, tables: string[]): Promise<string> {
  const names = tables.map(t => `'${t.replace(/'/g, "''")}'`).join(', ');
  const parts: unknown[] = [];
  const definitions = await client.execute(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name IN (${names}) ORDER BY name`);
  parts.push(definitions.columns, definitions.rows.map(row => definitions.columns.map(column => row[column])));
  for (const table of tables) {
    const result = await client.execute(`SELECT * FROM "${table.replace(/"/g, '""')}" ORDER BY rowid`);
    parts.push(table, result.columns, result.rows.map(row => result.columns.map(column => row[column])));
  }
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Removes a temp dir created by makeTempDir, after its database client is closed.
 * libsql releases a closed connection's Windows file handle only when it is
 * garbage collected, and Windows refuses to delete an open file (EPERM/EBUSY);
 * in that case a detached helper finishes the removal once this process is gone.
 */
export function removeTempDir(dir: string): void {
  const target = resolve(dir);
  if (!target.startsWith(resolve(tmpdir()) + sep)) throw new Error('Refusing to remove a directory outside the OS temp folder: ' + target);
  try {
    rmSync(target, { recursive: true, force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EBUSY') throw error;
    const script = 'const fs=require("fs");let n=0;(function t(){try{fs.rmSync(process.argv[1],{recursive:true,force:true})}catch{if(++n<100)setTimeout(t,200)}})();';
    spawn(process.execPath, ['-e', script, target], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
}
