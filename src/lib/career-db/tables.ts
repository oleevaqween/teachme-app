/**
 * The career database's tables and indexes. Each repository creates its own if missing,
 * and restore creates them all, from these same statements so the two can never drift apart.
 */
export const CV_STUDIO_TABLE_STATEMENTS: readonly string[] = [
  'CREATE TABLE IF NOT EXISTS cv_workspace (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS cv_version (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, label TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS cv_version_workspace ON cv_version(workspace_id, created_at)',
];

export const APPLICATION_TABLE_STATEMENTS: readonly string[] = [
  'CREATE TABLE IF NOT EXISTS job_application (id TEXT PRIMARY KEY, workspace_id TEXT, body TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE UNIQUE INDEX IF NOT EXISTS job_application_workspace ON job_application(workspace_id) WHERE workspace_id IS NOT NULL',
];

export const PRACTICE_TABLE_STATEMENTS: readonly string[] = [
  'CREATE TABLE IF NOT EXISTS practice_question (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS practice_question_workspace ON practice_question(workspace_id, created_at)',
  'CREATE TABLE IF NOT EXISTS practice_attempt (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, question_key TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS practice_attempt_question ON practice_attempt(workspace_id, question_key, created_at)',
];

/**
 * The screening answers table. Deliberately not part of CAREER_TABLE_STATEMENTS: restore creates it
 * only when it adds a backup's screening answers, so restoring an older backup creates no new table.
 */
export const SCREENING_TABLE_STATEMENT = 'CREATE TABLE IF NOT EXISTS screening_profile (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)';

export const CAREER_TABLE_STATEMENTS: readonly string[] = [...CV_STUDIO_TABLE_STATEMENTS, ...APPLICATION_TABLE_STATEMENTS, ...PRACTICE_TABLE_STATEMENTS];
