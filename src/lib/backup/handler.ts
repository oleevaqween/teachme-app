import type { Client } from '@libsql/client';
import { existsSync } from 'node:fs';
import { localRequest } from '@/lib/cv-studio/http';
import { emptyBackup, exportCareerData, type CareerBackup } from './export';
import { backupFileName } from './file-name';

export const BACKUP_FAILED = 'The backup could not be created. Please try again.';

type Deps = { databasePath: () => string; openClient: (path: string) => Client; now?: () => Date };

export function createBackupHandler(deps: Deps) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        localRequest(request);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Request refused.' }, { status: 400 });
      }
      const now = deps.now?.() ?? new Date();
      let backup: CareerBackup;
      try {
        const path = deps.databasePath();
        // Opening a missing SQLite file would create it, so a missing file means an empty backup.
        if (!existsSync(path)) {
          backup = emptyBackup(now);
        } else {
          const client = deps.openClient(path);
          try { backup = await exportCareerData(client, now); } finally { client.close(); }
        }
      } catch (error) {
        console.error('[backup] export failed:', error);
        return Response.json({ error: BACKUP_FAILED }, { status: 500 });
      }
      return new Response(JSON.stringify(backup, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${backupFileName(now)}"`,
          'Cache-Control': 'no-store',
        },
      });
    },
  };
}
