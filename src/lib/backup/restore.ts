import type { Client, Transaction } from '@libsql/client';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CAREER_TABLE_STATEMENTS, SCREENING_TABLE_STATEMENT } from '@/lib/career-db/tables';
import { CAREER_TABLES } from './export';
import { INSERT_SQL, planRestore, type BackupFile, type CurrentData, type RestorePlan } from './restore-plan';
import { CHANGED, RESTORE_KINDS, SAFETY_FAILED, type RestoreKind } from './restore-view';

export class RestoreChangedError extends Error { constructor() { super(CHANGED); } }
export class SafetyCopyError extends Error { constructor() { super(SAFETY_FAILED); } }

type Executor = Pick<Transaction, 'execute'>;

const CURRENT_QUERIES: Record<RestoreKind, [table: string, sql: string]> = {
  cvWorkspaces: ['cv_workspace', 'SELECT id, NULL AS workspace_id, body FROM cv_workspace'],
  cvVersions: ['cv_version', 'SELECT id, workspace_id, body FROM cv_version'],
  applications: ['job_application', 'SELECT id, workspace_id, body FROM job_application'],
  practiceQuestions: ['practice_question', 'SELECT id, workspace_id, body FROM practice_question'],
  practiceAttempts: ['practice_attempt', 'SELECT id, workspace_id, body FROM practice_attempt'],
};

async function existingTables(db: Executor): Promise<Set<string>> {
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(result.rows.map(row => String(row.name)));
}

/** Every career row's id, CV link and stored body; a missing table reads as empty. */
export async function readCurrent(db: Executor): Promise<CurrentData> {
  const present = await existingTables(db);
  const current = {} as CurrentData;
  for (const kind of RESTORE_KINDS) {
    const [table, sql] = CURRENT_QUERIES[kind];
    const rows = present.has(table) ? (await db.execute(sql)).rows : [];
    current[kind] = rows.map(row => ({ id: String(row.id), workspaceId: row.workspace_id === null ? null : String(row.workspace_id), body: String(row.body) }));
  }
  if (present.has('screening_profile')) {
    const profile = (await db.execute("SELECT body FROM screening_profile WHERE id = 'me'")).rows[0];
    if (profile) current.screeningProfile = String(profile.body);
  }
  return current;
}

/**
 * Read-only check. Safety: the connection is switched to query-only first, so SQLite itself
 * rejects any write; pass a dedicated, short-lived client, never the shared app connection.
 */
export async function checkRestore(client: Client, file: BackupFile, now = new Date()): Promise<RestorePlan> {
  await client.execute('PRAGMA query_only = ON');
  return planRestore(file, await readCurrent(client), now);
}

async function countRows(db: Executor): Promise<Record<string, number>> {
  const present = await existingTables(db);
  const counts: Record<string, number> = {};
  for (const table of [...CAREER_TABLES, 'screening_profile']) {
    if (present.has(table)) counts[table] = Number((await db.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n ?? 0);
  }
  return counts;
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** True when SQLite reports that the database file itself is unreadable (not a database, or corrupt). */
export function isDamagedDatabase(error: unknown): boolean {
  for (let e = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT') return true;
    if (typeof message === 'string' && /file is not a database|database disk image is malformed/i.test(message)) return true;
  }
  return false;
}

/** How many safety copies restore keeps; older copies it made are removed after a new one is verified. */
export const KEEP_SAFETY_COPIES = 5;
const SAFETY_COPY_NAME = /^career-(\d{8}-\d{6})(?:-(\d+))?\.db$/;

/**
 * Keeps the copy just made plus the newest others restore made, up to KEEP_SAFETY_COPIES in all; other files are never touched.
 * The new copy is always kept, even if older names sort after it (a clock that was once wrong). Pruning is best effort:
 * any failure leaves files in place and never stops the restore.
 */
function pruneSafetyCopies(safetyDir: string, keep: string) {
  try {
    const others = readdirSync(safetyDir).flatMap(name => {
      const match = SAFETY_COPY_NAME.exec(name);
      return match && name !== keep ? [{ name, stamp: match[1], n: Number(match[2] ?? 1) }] : [];
    }).sort((a, b) => (a.stamp === b.stamp ? b.n - a.n : a.stamp < b.stamp ? 1 : -1));
    for (const old of others.slice(KEEP_SAFETY_COPIES - 1)) {
      try { rmSync(join(safetyDir, old.name), { force: true }); } catch { /* Windows may still hold it open; it goes next time. */ }
    }
  } catch (error) {
    console.error('[restore] old safety copies were not tidied:', error);
  }
}

/** Copies the whole database with VACUUM INTO, reopens the copy and checks every career table has the same number of rows. */
export async function makeSafetyCopy(client: Client, safetyDir: string, now: Date, openClient: (path: string) => Client): Promise<string> {
  // Only errors from reading the user's database (not from the copy) mean that database is damaged.
  let readingSource = true;
  try {
    // Counting first also proves the database can be read before any folder or file is made.
    const before = await countRows(client);
    mkdirSync(safetyDir, { recursive: true });
    let target = join(safetyDir, `career-${stamp(now)}.db`);
    for (let n = 2; existsSync(target); n++) target = join(safetyDir, `career-${stamp(now)}-${n}.db`);
    await client.execute({ sql: 'VACUUM INTO ?', args: [target] });
    readingSource = false;
    const copy = openClient(target);
    let after: Record<string, number>;
    try { after = await countRows(copy); } finally { copy.close(); }
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('The safety copy does not match the database.');
    pruneSafetyCopies(safetyDir, basename(target));
    return target;
  } catch (error) {
    // A damaged database is reported as such, so the user is told how to set it aside.
    if (readingSource && isDamagedDatabase(error)) throw error;
    console.error('[restore] safety copy failed:', error);
    throw new SafetyCopyError();
  }
}

export type RestoreOptions = { databaseExisted: boolean; safetyDir: string; openClient: (path: string) => Client; now?: Date; newId?: () => string };

/**
 * Adds what the user approved. Order: safety copy (when there was a database), then one write
 * transaction that creates missing tables, re-reads the app, re-plans and compares fingerprints
 * before inserting. Any failure rolls the whole transaction back.
 */
export async function applyRestore(client: Client, file: BackupFile, fingerprint: string, options: RestoreOptions): Promise<{ plan: RestorePlan; safetyCopy: string | null }> {
  const now = options.now ?? new Date();
  // The copy records the data just before the restore (VACUUM cannot run inside the write transaction); restore only adds rows, so nothing the user had is at risk.
  const safetyCopy = options.databaseExisted ? await makeSafetyCopy(client, options.safetyDir, now, options.openClient) : null;
  const tx = await client.transaction('write');
  try {
    for (const statement of CAREER_TABLE_STATEMENTS) await tx.execute(statement);
    const plan = planRestore(file, await readCurrent(tx), now, options.newId);
    if (plan.fingerprint !== fingerprint) throw new RestoreChangedError();
    // Only a restore that adds screening answers creates their table, so older backups add no table.
    if (plan.screeningProfile === 'add') await tx.execute(SCREENING_TABLE_STATEMENT);
    for (const insert of plan.inserts) await tx.execute({ sql: INSERT_SQL[insert.kind], args: insert.args });
    await tx.commit();
    return { plan, safetyCopy };
  } catch (error) {
    // SQLite may already have rolled back by itself (e.g. disk full); the original error must be the one reported.
    await tx.rollback().catch(() => {});
    throw error;
  } finally {
    tx.close();
  }
}
