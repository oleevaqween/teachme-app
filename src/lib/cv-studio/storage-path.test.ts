import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { createRepository } from './repository';
import { resolveCareerDatabasePath } from './storage-path';
import { fixture } from './test-fixture';

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('CV Studio database boundary', () => {
  it('uses a dedicated application-local database and rejects protected paths', () => {
    const root = join(tmpdir(), 'teachme-root');
    expect(resolveCareerDatabasePath(root)).toBe(join(root, '.data', 'career.db'));
    expect(resolveCareerDatabasePath(root, '.integration-data/career.db')).toBe(join(root, '.integration-data', 'career.db'));
    expect(() => resolveCareerDatabasePath(root, 'dev.db')).toThrow('cannot use the TeachMe');
    expect(() => resolveCareerDatabasePath(root, '.data/app.db')).toThrow('cannot use the TeachMe');
    expect(() => resolveCareerDatabasePath(root, '../outside.db')).toThrow('must stay inside');
  });

  it('can save a CV without changing a separate TeachMe database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teachme-data-boundary-'));
    const mainPath = join(root, 'dev.db');
    const careerPath = resolveCareerDatabasePath(root);
    mkdirSync(join(root, '.data'), { recursive: true });
    const main = createClient({ url: pathToFileURL(mainPath).href });
    await main.batch([
      'CREATE TABLE protected_teachme_data (id TEXT PRIMARY KEY, body TEXT NOT NULL)',
      { sql: 'INSERT INTO protected_teachme_data VALUES (?, ?)', args: ['journey-1', 'preserve me'] },
    ], 'write');
    main.close();
    const before = sha256(mainPath);

    const career = createClient({ url: pathToFileURL(careerPath).href });
    const repository = createRepository(career);
    await repository.save(fixture(), 0, 'Safety test');
    expect((await repository.list())).toHaveLength(1);
    career.close();

    expect(sha256(mainPath)).toBe(before);
    const verifyMain = createClient({ url: pathToFileURL(mainPath).href });
    const saved = await verifyMain.execute({ sql: 'SELECT body FROM protected_teachme_data WHERE id = ?', args: ['journey-1'] });
    expect(saved.rows[0]?.body).toBe('preserve me');
    verifyMain.close();
  });
});
