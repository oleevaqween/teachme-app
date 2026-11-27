import type { Client, Row, Transaction } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { ConflictError } from '@/lib/cv-studio/repository';
import { getCareerClient } from '@/lib/career-db/client';
import { APPLICATION_TABLE_STATEMENTS } from '@/lib/career-db/tables';
import { localDate, NOT_LINKED } from './hygiene';
import { ApplicationInputSchema, TrackedApplicationSchema, type ApplicationInput, type SavedApplication, type Sent, type TrackedApplication } from './schema';
import type { FindSent } from './sent';

export const LINK_TAKEN = 'This CV is already linked to another application.';
export const UNREADABLE_ENTRY = 'This entry could not be read.';
export const STALE_ENTRY = 'This entry changed in another tab. Reload to see the latest version.';

/**
 * Job application tracker storage in career.db. Safety: the only schema
 * statements are CREATE ... IF NOT EXISTS for this tracker's own table and
 * index; CV Studio tables are never touched here (the injected sent lookup
 * only reads cv_version labels).
 */
export function createApplicationRepository(client: Client) {
  let ready: Promise<unknown> | undefined;
  // A failed init clears the cached promise so the next call can retry.
  const init = () => ready ??= client.batch([...APPLICATION_TABLE_STATEMENTS], 'write').catch(error => { ready = undefined; throw error; });

  const toSaved = (row: Row): SavedApplication => ({
    ...TrackedApplicationSchema.parse(JSON.parse(String(row.body))),
    revision: Number(row.revision),
    updatedAt: String(row.updated_at),
  });

  /** The stored entry and its revision, read outside any transaction; null when missing, app null when unreadable. */
  async function peek(id: string): Promise<{ app: TrackedApplication | null; revision: number } | null> {
    await init();
    const row = (await client.execute({ sql: 'SELECT body, revision FROM job_application WHERE id = ?', args: [id] })).rows[0];
    if (!row) return null;
    try {
      return { app: TrackedApplicationSchema.parse(JSON.parse(String(row.body))), revision: Number(row.revision) };
    } catch {
      return { app: null, revision: Number(row.revision) };
    }
  }

  async function assertLinkFree(tx: Transaction, workspaceId: string | null, ownId: string) {
    if (!workspaceId) return;
    const taken = await tx.execute({ sql: 'SELECT id FROM job_application WHERE workspace_id = ? AND id != ?', args: [workspaceId, ownId] });
    if (taken.rows.length) throw new ConflictError(LINK_TAKEN);
  }

  async function inTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    await init();
    const tx = await client.transaction('write');
    try {
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (error) {
      // A failed rollback must not hide the original error.
      await tx.rollback().catch(() => {});
      throw error;
    } finally {
      tx.close();
    }
  }

  return {
    /** Rows that fail validation are reported, not thrown, so one bad row cannot hide the rest. */
    async listReadable(): Promise<{ applications: SavedApplication[]; unreadable: string[] }> {
      await init();
      const result = await client.execute('SELECT * FROM job_application ORDER BY updated_at DESC');
      const applications: SavedApplication[] = [];
      const unreadable: string[] = [];
      for (const row of result.rows) {
        try { applications.push(toSaved(row)); } catch { unreadable.push(String(row.id)); }
      }
      return { applications, unreadable };
    },

    async create(input: ApplicationInput, now = new Date(), findSent?: FindSent): Promise<SavedApplication> {
      const data = ApplicationInputSchema.parse(input);
      const at = now.toISOString();
      const applied = data.status === 'applied';
      // Looked up before the write transaction, so reading CV versions never holds the tracker's write lock.
      const sent = applied && data.workspaceId && findSent ? await findSent(data.workspaceId, now) : undefined;
      const app: TrackedApplication = TrackedApplicationSchema.parse({
        ...data,
        appliedOn: data.appliedOn ?? (applied ? localDate(now) : undefined),
        sent,
        id: randomUUID(), history: [{ at, from: null, to: data.status }], createdAt: at,
      });
      return inTransaction(async tx => {
        await assertLinkFree(tx, app.workspaceId, app.id);
        await tx.execute({ sql: 'INSERT INTO job_application VALUES (?, ?, ?, ?, ?)', args: [app.id, app.workspaceId, JSON.stringify(app), 1, at] });
        return { ...app, revision: 1, updatedAt: at };
      });
    },

    async update(id: string, input: ApplicationInput, expectedRevision: number, now = new Date(), findSent?: FindSent): Promise<SavedApplication> {
      const data = ApplicationInputSchema.parse(input);
      const at = now.toISOString();
      // Looked up before the write transaction, so reading CV versions never holds the tracker's write lock.
      let found: Sent | undefined;
      if (findSent && data.status === 'applied' && data.workspaceId) {
        const before = await peek(id);
        // The record is made once: again only when there is none yet, the last lookup failed, or the linked CV changed.
        const usable = before?.app?.sent && !before.app.sent.failed && before.app.workspaceId === data.workspaceId;
        if (before?.app && before.app.status !== 'applied' && !usable) found = await findSent(data.workspaceId, now);
      }
      return inTransaction(async tx => {
        const current = await tx.execute({ sql: 'SELECT body, revision FROM job_application WHERE id = ?', args: [id] });
        const row = current.rows[0];
        if (!row || Number(row.revision) !== expectedRevision) throw new ConflictError(STALE_ENTRY);
        const stored = TrackedApplicationSchema.parse(JSON.parse(String(row.body)));
        await assertLinkFree(tx, data.workspaceId, id);
        // History is server-owned: it grows only when the status actually changes.
        const history = data.status === stored.status
          ? stored.history
          : [...stored.history, { at, from: stored.status, to: data.status }].slice(-500);
        const toApplied = data.status === 'applied' && stored.status !== 'applied';
        // Applied on is filled once, on the first change to Applied, and only when the user left it empty.
        const firstApplied = toApplied && !stored.history.some(h => h.to === 'applied');
        const appliedOn = data.appliedOn ?? (firstApplied ? localDate(now) : undefined);
        // The sent record belongs to the linked CV, so a different link drops it.
        const sent = toApplied && found ? found : data.workspaceId === stored.workspaceId ? stored.sent : undefined;
        const app = TrackedApplicationSchema.parse({ ...data, appliedOn, sent, id, history, createdAt: stored.createdAt });
        const revision = expectedRevision + 1;
        await tx.execute({
          sql: 'UPDATE job_application SET workspace_id = ?, body = ?, revision = ?, updated_at = ? WHERE id = ?',
          args: [app.workspaceId, JSON.stringify(app), revision, at, id],
        });
        return { ...app, revision, updatedAt: at };
      });
    },

    /** "Use my latest download": repeats the lookup for the linked CV and saves only its result. */
    async refreshSent(id: string, expectedRevision: number, findSent: FindSent, now = new Date()): Promise<SavedApplication> {
      const before = await peek(id);
      if (!before || before.revision !== expectedRevision) throw new ConflictError(STALE_ENTRY);
      if (!before.app) throw new Error(UNREADABLE_ENTRY);
      const workspaceId = before.app.workspaceId;
      if (!workspaceId) throw new Error(NOT_LINKED);
      const sent = await findSent(workspaceId, now);
      const at = now.toISOString();
      return inTransaction(async tx => {
        const current = await tx.execute({ sql: 'SELECT body, revision FROM job_application WHERE id = ?', args: [id] });
        const row = current.rows[0];
        if (!row || Number(row.revision) !== expectedRevision) throw new ConflictError(STALE_ENTRY);
        const stored = TrackedApplicationSchema.parse(JSON.parse(String(row.body)));
        const app = TrackedApplicationSchema.parse({ ...stored, sent });
        const revision = expectedRevision + 1;
        await tx.execute({ sql: 'UPDATE job_application SET body = ?, revision = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(app), revision, at, id] });
        return { ...app, revision, updatedAt: at };
      });
    },

    async remove(id: string, expectedRevision: number): Promise<{ id: string }> {
      return inTransaction(async tx => {
        const current = await tx.execute({ sql: 'SELECT revision FROM job_application WHERE id = ?', args: [id] });
        const row = current.rows[0];
        if (!row || Number(row.revision) !== expectedRevision) throw new ConflictError(STALE_ENTRY);
        await tx.execute({ sql: 'DELETE FROM job_application WHERE id = ?', args: [id] });
        return { id };
      });
    },
  };
}

export type ApplicationRepository = ReturnType<typeof createApplicationRepository>;

let repository: ApplicationRepository | undefined;
export function getApplicationRepository(): ApplicationRepository {
  return repository ??= createApplicationRepository(getCareerClient());
}
