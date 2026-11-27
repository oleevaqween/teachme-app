import type { Client, Row } from '@libsql/client';

export const BACKUP_FORMAT = 'teachme-career-backup';
export const BACKUP_VERSION = 1;
export const CAREER_TABLES = ['cv_workspace', 'cv_version', 'job_application', 'practice_question', 'practice_attempt'] as const;
type CareerTable = (typeof CAREER_TABLES)[number];

type StoredBody = { body: unknown; bodyUnreadable?: true };
export type CareerBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  counts: { cvWorkspaces: number; cvVersions: number; applications: number; practiceQuestions: number; practiceAttempts: number; unreadableRows: number };
  cvWorkspaces: ({ id: string; revision: number; updatedAt: string } & StoredBody)[];
  cvVersions: ({ id: string; workspaceId: string; label: string; createdAt: string } & StoredBody)[];
  applications: ({ id: string; workspaceId: string | null; revision: number; updatedAt: string } & StoredBody)[];
  practiceQuestions: ({ id: string; workspaceId: string; createdAt: string } & StoredBody)[];
  practiceAttempts: ({ id: string; workspaceId: string; questionKey: string; createdAt: string } & StoredBody)[];
  /** Optional: present only when the app has screening answers; older backups have none. */
  screeningProfile?: { revision: number; updatedAt: string } & StoredBody;
};

// Read queries only; each table in a stable time-then-id order.
const QUERIES: Record<CareerTable, string> = {
  cv_workspace: 'SELECT id, revision, updated_at, body FROM cv_workspace ORDER BY updated_at, id',
  cv_version: 'SELECT id, workspace_id, label, created_at, body FROM cv_version ORDER BY created_at, id',
  job_application: 'SELECT id, workspace_id, revision, updated_at, body FROM job_application ORDER BY updated_at, id',
  practice_question: 'SELECT id, workspace_id, created_at, body FROM practice_question ORDER BY created_at, id',
  practice_attempt: 'SELECT id, workspace_id, question_key, created_at, body FROM practice_attempt ORDER BY created_at, id',
};

export function emptyBackup(now: Date): CareerBackup {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(),
    counts: { cvWorkspaces: 0, cvVersions: 0, applications: 0, practiceQuestions: 0, practiceAttempts: 0, unreadableRows: 0 },
    cvWorkspaces: [], cvVersions: [], applications: [], practiceQuestions: [], practiceAttempts: [],
  };
}

/** Parsed JSON when possible; otherwise the raw text, flagged, so nothing is lost. */
function storedBody(raw: unknown): StoredBody {
  const text = String(raw);
  try { return { body: JSON.parse(text) }; } catch { return { body: text, bodyUnreadable: true }; }
}

/**
 * Reads every career table. Safety: the connection is switched to query-only
 * first, so SQLite itself rejects any write or schema change; tables that do
 * not exist are skipped rather than added.
 *
 * The passed client must be a dedicated, short-lived connection: it is left
 * query-only afterwards, so callers must not pass a shared app connection.
 * Create it with concurrency: 1 so the query-only switch and every read share
 * one pooled connection.
 */
export async function exportCareerData(client: Client, now = new Date()): Promise<CareerBackup> {
  await client.execute('PRAGMA query_only = ON');
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  const existing = new Set(tables.rows.map(row => String(row.name)));
  const present = CAREER_TABLES.filter(table => existing.has(table));
  const results = present.length ? await client.batch(present.map(table => QUERIES[table]), 'read') : [];
  const rowsOf = (table: CareerTable): Row[] => {
    const index = present.indexOf(table);
    return index === -1 ? [] : results[index].rows;
  };

  const backup = emptyBackup(now);
  backup.cvWorkspaces = rowsOf('cv_workspace').map(r => ({ id: String(r.id), revision: Number(r.revision), updatedAt: String(r.updated_at), ...storedBody(r.body) }));
  backup.cvVersions = rowsOf('cv_version').map(r => ({ id: String(r.id), workspaceId: String(r.workspace_id), label: String(r.label), createdAt: String(r.created_at), ...storedBody(r.body) }));
  backup.applications = rowsOf('job_application').map(r => ({ id: String(r.id), workspaceId: r.workspace_id === null ? null : String(r.workspace_id), revision: Number(r.revision), updatedAt: String(r.updated_at), ...storedBody(r.body) }));
  backup.practiceQuestions = rowsOf('practice_question').map(r => ({ id: String(r.id), workspaceId: String(r.workspace_id), createdAt: String(r.created_at), ...storedBody(r.body) }));
  backup.practiceAttempts = rowsOf('practice_attempt').map(r => ({ id: String(r.id), workspaceId: String(r.workspace_id), questionKey: String(r.question_key), createdAt: String(r.created_at), ...storedBody(r.body) }));
  // Screening answers are optional in the file: a database without the table or the row exports none.
  if (existing.has('screening_profile')) {
    const profile = (await client.execute("SELECT revision, updated_at, body FROM screening_profile WHERE id = 'me'")).rows[0];
    if (profile) backup.screeningProfile = { revision: Number(profile.revision), updatedAt: String(profile.updated_at), ...storedBody(profile.body) };
  }

  const all = [...backup.cvWorkspaces, ...backup.cvVersions, ...backup.applications, ...backup.practiceQuestions, ...backup.practiceAttempts];
  backup.counts = {
    cvWorkspaces: backup.cvWorkspaces.length, cvVersions: backup.cvVersions.length, applications: backup.applications.length,
    practiceQuestions: backup.practiceQuestions.length, practiceAttempts: backup.practiceAttempts.length,
    unreadableRows: all.filter(row => row.bodyUnreadable).length + (backup.screeningProfile?.bodyUnreadable ? 1 : 0),
  };
  return backup;
}
