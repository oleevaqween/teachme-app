import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { getCareerClient } from '@/lib/career-db/client';
import { CV_STUDIO_TABLE_STATEMENTS } from '@/lib/career-db/tables';
import { WorkspaceSchema, type Workspace, type SavedWorkspace, type Version } from './schema';

export class ConflictError extends Error {}
export function createRepository(client: Client) {
  let ready: Promise<unknown> | undefined;
  function init() {
    return ready ??= client.batch([...CV_STUDIO_TABLE_STATEMENTS], 'write');
  }
  /** Reads every saved workspace; rows that no longer validate are reported, not thrown, so one bad row cannot hide the rest. */
  async function listReadable(): Promise<{ workspaces: SavedWorkspace[]; unreadable: string[] }> {
    await init();
    const r = await client.execute('SELECT * FROM cv_workspace ORDER BY updated_at DESC');
    const workspaces: SavedWorkspace[] = [], unreadable: string[] = [];
    for (const row of r.rows) {
      try { workspaces.push({ ...WorkspaceSchema.parse(JSON.parse(String(row.body))), revision: Number(row.revision), updatedAt: String(row.updated_at) }); }
      catch { unreadable.push(String(row.id)); }
    }
    return { workspaces, unreadable };
  }
  return {
    listReadable,
    async list(): Promise<SavedWorkspace[]> {
      return (await listReadable()).workspaces;
    },
    async get(id: string): Promise<SavedWorkspace | null> {
      await init();
      const r = await client.execute({ sql: 'SELECT * FROM cv_workspace WHERE id = ?', args: [id] });
      const row = r.rows[0];
      return row ? { ...WorkspaceSchema.parse(JSON.parse(String(row.body))), revision: Number(row.revision), updatedAt: String(row.updated_at) } : null;
    },
    async save(input: Workspace, expectedRevision: number, checkpoint?: string): Promise<SavedWorkspace> {
      await init();
      const w = WorkspaceSchema.parse(input);
      const body = JSON.stringify(w), updatedAt = new Date().toISOString();
      const tx = await client.transaction('write');
      try {
        const current = await tx.execute({ sql: 'SELECT revision FROM cv_workspace WHERE id = ?', args: [w.id] });
        const revision = current.rows[0] ? Number(current.rows[0].revision) : 0;
        if (revision !== expectedRevision) throw new ConflictError('This CV was changed in another tab. Your edits have been kept locally; reload after exporting a recovery copy.');
        if (revision === 0) await tx.execute({ sql: 'INSERT INTO cv_workspace VALUES (?, ?, ?, ?)', args: [w.id, body, 1, updatedAt] });
        else await tx.execute({ sql: 'UPDATE cv_workspace SET body = ?, revision = ?, updated_at = ? WHERE id = ?', args: [body, revision + 1, updatedAt, w.id] });
        if (checkpoint || revision === 0) await tx.execute({
          sql: 'INSERT INTO cv_version VALUES (?, ?, ?, ?, ?)',
          args: [randomUUID(), w.id, checkpoint || 'Created', body, updatedAt],
        });
        await tx.commit();
        return { ...w, revision: revision + 1, updatedAt };
      } catch (e) {
        await tx.rollback();
        throw e;
      } finally { tx.close(); }
    },
    async versions(id: string): Promise<Version[]> {
      await init();
      const r = await client.execute({ sql: 'SELECT * FROM cv_version WHERE workspace_id = ? ORDER BY created_at DESC', args: [id] });
      return r.rows.map(row => ({ id: String(row.id), label: String(row.label), createdAt: String(row.created_at), workspace: WorkspaceSchema.parse(JSON.parse(String(row.body))) }));
    },
    async removeApplication(id: string, expectedRevision: number): Promise<{ id: string; removedVersions: number }> {
      await init();
      const tx = await client.transaction('write');
      try {
        const current = await tx.execute({ sql: 'SELECT body, revision FROM cv_workspace WHERE id = ?', args: [id] });
        const row = current.rows[0];
        if (!row || Number(row.revision) !== expectedRevision) throw new ConflictError('This application changed or was removed in another tab. Reload before trying again.');
        const workspace = WorkspaceSchema.parse(JSON.parse(String(row.body)));
        if (workspace.kind !== 'application') throw new Error('Master CVs are protected and cannot be deleted here.');
        const count = await tx.execute({ sql: 'SELECT COUNT(*) AS total FROM cv_version WHERE workspace_id = ?', args: [id] });
        const removedVersions = Number(count.rows[0]?.total ?? 0);
        await tx.execute({ sql: 'DELETE FROM cv_version WHERE workspace_id = ?', args: [id] });
        await tx.execute({ sql: 'DELETE FROM cv_workspace WHERE id = ?', args: [id] });
        await tx.commit();
        return { id, removedVersions };
      } catch (error) {
        await tx.rollback();
        throw error;
      } finally { tx.close(); }
    },
  };
}
let repository: ReturnType<typeof createRepository> | undefined;
export function getRepository() {
  return repository ??= createRepository(getCareerClient());
}
