import type { Client } from '@libsql/client';
import type { Sent } from './schema';

/** Labels CV Studio writes on every download (useStudioController exportFile: 'Exported ' + kind + ' ' + FORMAT). */
export const CV_EXPORT = 'Exported cv ';
export const LETTER_EXPORT = 'Exported letter ';

export type VersionLabel = { id: string; label: string; createdAt: string };
export type ReadVersions = (workspaceId: string) => Promise<VersionLabel[]>;
export type FindSent = (workspaceId: string, now: Date) => Promise<Sent>;

/**
 * Labels of one CV's saved versions, newest first. Safety: reads cv_version only
 * (never its bodies), never writes, and a missing table reads as no versions.
 */
export function versionLabelReader(client: Client): ReadVersions {
  return async workspaceId => {
    const table = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cv_version'");
    if (!table.rows.length) return [];
    const result = await client.execute({ sql: 'SELECT id, label, created_at FROM cv_version WHERE workspace_id = ? ORDER BY created_at DESC, id', args: [workspaceId] });
    return result.rows.map(row => ({ id: String(row.id), label: String(row.label), createdAt: String(row.created_at) }));
  };
}

const newest = (versions: VersionLabel[], prefix: string) =>
  versions.filter(v => v.label.startsWith(prefix)).reduce<VersionLabel | undefined>((best, v) => (!best || v.createdAt > best.createdAt ? v : best), undefined);

/** The stored limit for a version id and label (SentSchema), so a long label can never block a status change. */
const MAX_STORED = 200;
const file = (v: VersionLabel) => ({ versionId: v.id.slice(0, MAX_STORED), label: v.label.slice(0, MAX_STORED), at: v.createdAt });

/** Finds the newest CV and letter downloads. A failed read is recorded as failed, never thrown, so the application still saves. */
export function sentFinder(readVersions: ReadVersions): FindSent {
  return async (workspaceId, now) => {
    const checkedAt = now.toISOString();
    try {
      const versions = await readVersions(workspaceId);
      const cv = newest(versions, CV_EXPORT);
      const letter = newest(versions, LETTER_EXPORT);
      return {
        ...(cv ? { cv: file(cv) } : {}),
        ...(letter ? { letter: file(letter) } : {}),
        checkedAt,
      };
    } catch (error) {
      console.warn('[applications] Could not check CV downloads:', error);
      return { checkedAt, failed: true };
    }
  };
}
