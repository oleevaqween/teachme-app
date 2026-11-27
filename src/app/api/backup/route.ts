import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { createBackupHandler } from '@/lib/backup/handler';
import { resolveCareerDatabasePath } from '@/lib/cv-studio/storage-path';

export const runtime = 'nodejs';

// Nothing opens a database here; the handler opens its own short-lived client per request.
const handler = createBackupHandler({
  databasePath: () => resolveCareerDatabasePath(process.cwd(), process.env.CV_STUDIO_DATABASE_PATH),
  openClient: path => createClient({ url: pathToFileURL(path).href, concurrency: 1 }),
});

export async function GET(request: Request) {
  return handler.GET(request);
}
