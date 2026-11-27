import type { Client } from '@libsql/client';
import { getCareerClient } from '@/lib/career-db/client';
import { SCREENING_TABLE_STATEMENT } from '@/lib/career-db/tables';
import { ConflictError } from '@/lib/cv-studio/repository';
import { SCREENING_CONFLICT, ScreeningAnswersSchema, ScreeningProfileBodySchema, type ScreeningAnswers, type ScreeningProfile } from './screening';

/** The one profile row's id. */
export const PROFILE_ID = 'me';

/**
 * The user's standard screening answers in career.db. Safety: the only schema statement
 * is SCREENING_TABLE_STATEMENT (created if missing); no other table is read or written.
 */
export function createScreeningRepository(client: Client) {
  let ready: Promise<unknown> | undefined;
  // A failed init clears the cached promise so the next call can retry.
  const init = () => ready ??= client.execute(SCREENING_TABLE_STATEMENT).catch(error => { ready = undefined; throw error; });

  return {
    /**
     * Empty answers and revision 0 when nothing has been saved yet. A stored body that cannot be read opens as empty
     * answers with its real revision and `unreadable: true`; nothing is written, and a save with that revision replaces it.
     */
    async get(): Promise<ScreeningProfile> {
      await init();
      const row = (await client.execute({ sql: 'SELECT body, revision FROM screening_profile WHERE id = ?', args: [PROFILE_ID] })).rows[0];
      if (!row) return { answers: {}, revision: 0 };
      const revision = Number(row.revision);
      try {
        return { answers: ScreeningProfileBodySchema.parse(JSON.parse(String(row.body))).answers, revision };
      } catch {
        return { answers: {}, revision, unreadable: true };
      }
    },

    async save(input: ScreeningAnswers, expectedRevision: number, now = new Date()): Promise<ScreeningProfile> {
      const answers = ScreeningAnswersSchema.parse(input);
      await init();
      const tx = await client.transaction('write');
      try {
        const current = await tx.execute({ sql: 'SELECT revision FROM screening_profile WHERE id = ?', args: [PROFILE_ID] });
        const revision = current.rows[0] ? Number(current.rows[0].revision) : 0;
        if (revision !== expectedRevision) throw new ConflictError(SCREENING_CONFLICT);
        const body = JSON.stringify({ answers });
        const at = now.toISOString();
        if (revision === 0) await tx.execute({ sql: 'INSERT INTO screening_profile (id, body, revision, updated_at) VALUES (?, ?, ?, ?)', args: [PROFILE_ID, body, 1, at] });
        else await tx.execute({ sql: 'UPDATE screening_profile SET body = ?, revision = ?, updated_at = ? WHERE id = ?', args: [body, revision + 1, at, PROFILE_ID] });
        await tx.commit();
        return { answers, revision: revision + 1 };
      } catch (error) {
        // A failed rollback must not hide the original error.
        await tx.rollback().catch(() => {});
        throw error;
      } finally {
        tx.close();
      }
    },
  };
}

export type ScreeningRepository = ReturnType<typeof createScreeningRepository>;

let repository: ScreeningRepository | undefined;
export function getScreeningRepository(): ScreeningRepository {
  return repository ??= createScreeningRepository(getCareerClient());
}
