import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRepository } from './repository';
import { fixture } from './test-fixture';

describe('Saved CV library resilience', () => {
  it('skips and reports an unreadable row instead of hiding every CV', async () => {
    // Throwaway database in the OS temp folder; never the real career.db.
    const directory = mkdtempSync(join(tmpdir(), 'teachme-cv-resilience-'));
    const client = createClient({ url: pathToFileURL(join(directory, 'test.db')).href });
    try {
      const repo = createRepository(client);
      await repo.save(fixture(), 0);
      await client.execute({
        sql: 'INSERT INTO cv_workspace VALUES (?, ?, ?, ?)',
        args: ['broken-row', JSON.stringify({ id: 'broken-row', name: '' }), 1, new Date().toISOString()],
      });

      const { workspaces, unreadable } = await repo.listReadable();
      expect(workspaces).toHaveLength(1);
      expect(unreadable).toEqual(['broken-row']);
      expect(await repo.list()).toHaveLength(1);

      const raw = await client.execute('SELECT COUNT(*) AS total FROM cv_workspace');
      expect(Number(raw.rows[0].total)).toBe(2); // the unreadable row is left untouched
    } finally {
      client.close();
    }
  });
});
