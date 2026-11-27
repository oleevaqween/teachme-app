import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { createRestoreHandler } from '@/lib/backup/restore-handler';
import { BUSY_TIMEOUT_MS } from '@/lib/career-db/client';
import { resolveCareerDatabasePath } from '@/lib/cv-studio/storage-path';

export const runtime = 'nodejs';

// Nothing opens a database here; the handler opens its own short-lived client per request.
const handler = createRestoreHandler({
  databasePath: () => resolveCareerDatabasePath(process.cwd(), process.env.CV_STUDIO_DATABASE_PATH),
  openClient: path => createClient({ url: pathToFileURL(path).href, concurrency: 1, timeout: BUSY_TIMEOUT_MS }),
});

export async function POST(request: Request) {
  return handler.POST(request);
}
