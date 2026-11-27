import { createClient, type Client } from '@libsql/client';
import { careerDatabaseUrl } from '@/lib/cv-studio/storage-path';

/**
 * How long a write waits, in milliseconds, when another program holds the database's write lock.
 * The wait pauses the server, so keep it short.
 */
export const BUSY_TIMEOUT_MS = 5000;

type CareerGlobal = typeof globalThis & { __teachmeCareerClient?: Client };

/**
 * The one shared client for career.db, used by CV Studio, the tracker and practice.
 * It is cached on globalThis so a dev-server hot reload reuses it instead of opening another.
 * The backup export deliberately does not use it: it needs its own query-only connection.
 */
export function getCareerClient(): Client {
  const store = globalThis as CareerGlobal;
  if (!store.__teachmeCareerClient || store.__teachmeCareerClient.closed) {
    store.__teachmeCareerClient = createClient({ url: careerDatabaseUrl(), timeout: BUSY_TIMEOUT_MS });
  }
  return store.__teachmeCareerClient;
}
