import { createClient } from '@libsql/client';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApplicationRepository } from '@/lib/applications/repository';
import { blankApplicationInput } from '@/lib/applications/schema';
import { seedCareerData } from '@/lib/backup/test-seed';
import { createRepository } from '@/lib/cv-studio/repository';
import type { Workspace } from '@/lib/cv-studio/schema';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';

const ROUNDS = 25;

/** Number of operating-system handles this process holds open (Windows). */
function openHandles(): number {
  const output = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${process.pid}).HandleCount`], { windowsHide: true });
  return Number(output.toString().trim());
}

describe('career database connections', () => {
  // Each leaked SQLite connection holds a Windows file handle until garbage collection, so the handle count shows a leak.
  it.skipIf(process.platform !== 'win32')('does not hold a connection open per CV save or tracker edit', async () => {
    const dir = makeTempDir('teachme-connections-');
    const client = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
    try {
      await seedCareerData(client);
      const cv = createRepository(client);
      const tracker = createApplicationRepository(client);
      let workspace = (await cv.get('app-1')) as Workspace & { revision: number };
      let [entry] = (await tracker.listReadable()).applications;
      const before = openHandles();

      for (let round = 0; round < ROUNDS; round++) {
        workspace = await cv.save({ ...workspace, name: `Acme PM ${round}` }, workspace.revision, `Edit ${round}`);
        const status = round % 2 ? 'applied' : 'interviewing';
        entry = await tracker.update(entry.id, blankApplicationInput({ workspaceId: 'app-1', company: 'Acme', role: 'Project Manager', status }), entry.revision);
      }

      const growth = openHandles() - before;
      // 2 transactions per round; a leak adds one handle each (50). Allow a little unrelated noise.
      expect(growth).toBeLessThan(10);
      expect((await cv.versions('app-1')).length).toBe(2 + ROUNDS);
    } finally {
      client.close();
      removeTempDir(dir);
    }
    // 50 saves plus two PowerShell handle counts can pass 5 seconds when the full suite runs in parallel.
  }, 30_000);
});
