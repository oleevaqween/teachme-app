import type { Client } from '@libsql/client';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { localRequest, readBytes } from '@/lib/cv-studio/http';
import { prepareCareerFolder } from '@/lib/cv-studio/storage-path';
import { applyRestore, checkRestore, isDamagedDatabase, RestoreChangedError, SafetyCopyError } from './restore';
import { emptyCurrent, parseBackupFile, planRestore, RestoreFileError, toView, type BackupFile } from './restore-plan';
import { CHECK_FAILED, damagedMessage, MAX_FILE_BYTES, MISSING_FINGERPRINT, NOT_BACKUP, RESTORE_FAILED, TOO_LARGE, UNKNOWN_ACTION, type RestoreResultView } from './restore-view';

type Deps = { databasePath: () => string; openClient: (path: string) => Client; now?: () => Date; maxBytes?: number };

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** POST ?action=check (read-only) or ?action=restore&fingerprint=...; the body is the backup file. Each request opens its own short-lived client. */
export function createRestoreHandler(deps: Deps) {
  return {
    async POST(request: Request): Promise<Response> {
      try {
        localRequest(request);
      } catch (error) {
        return fail(error instanceof Error ? error.message : 'Request refused.', 400);
      }
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      if (action !== 'check' && action !== 'restore') return fail(UNKNOWN_ACTION, 400);
      const fingerprint = url.searchParams.get('fingerprint') ?? '';
      if (action === 'restore' && !/^[0-9a-f]{64}$/.test(fingerprint)) return fail(MISSING_FINGERPRINT, 400);

      let file: BackupFile;
      try {
        file = parseBackupFile((await readBytes(request, deps.maxBytes ?? MAX_FILE_BYTES)).toString('utf8'));
      } catch (error) {
        if (error instanceof RestoreFileError) return fail(error.message, 400);
        return fail(error instanceof Error && error.message === 'The request is too large.' ? TOO_LARGE : NOT_BACKUP, 400);
      }
      const now = deps.now?.() ?? new Date();

      let path = '';
      if (action === 'check') {
        try {
          path = deps.databasePath();
          // Opening a missing SQLite file would create it, so a missing file is checked as an empty app.
          if (!existsSync(path)) return Response.json(toView(planRestore(file, emptyCurrent(), now)));
          const client = deps.openClient(path);
          try { return Response.json(toView(await checkRestore(client, file, now))); } finally { client.close(); }
        } catch (error) {
          console.error('[restore] check failed:', error);
          if (isDamagedDatabase(error)) return fail(damagedMessage(path), 500);
          return fail(CHECK_FAILED, 500);
        }
      }

      try {
        path = deps.databasePath();
        const databaseExisted = existsSync(path);
        // A wiped data folder is the main recovery case; libsql cannot create the folder itself.
        prepareCareerFolder(path);
        const client = deps.openClient(path);
        try {
          const { plan, safetyCopy } = await applyRestore(client, file, fingerprint, {
            databaseExisted, safetyDir: join(dirname(path), 'restore-safety'), openClient: deps.openClient, now,
          });
          const result: RestoreResultView = {
            summary: plan.summary, versionCopies: plan.versionCopies, addCount: plan.addCount, safetyCopy,
            ...(plan.screeningProfile === 'add' ? { screeningProfileAdded: true } : {}),
          };
          return Response.json(result);
        } finally {
          client.close();
        }
      } catch (error) {
        if (error instanceof RestoreChangedError) return fail(error.message, 409);
        if (error instanceof SafetyCopyError) return fail(error.message, 500);
        console.error('[restore] failed:', error);
        if (isDamagedDatabase(error)) return fail(damagedMessage(path), 500);
        return fail(RESTORE_FAILED, 500);
      }
    },
  };
}
