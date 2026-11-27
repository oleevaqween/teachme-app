import { createClient, type Client } from '@libsql/client';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApplicationRepository } from '@/lib/applications/repository';
import { createRepository } from '@/lib/cv-studio/repository';
import { createPracticeRepository } from '@/lib/practice/repository';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { CAREER_TABLE_STATEMENTS } from './tables';

let dir: string;
let clients: Client[];
beforeEach(() => { dir = makeTempDir('teachme-career-tables-'); clients = []; });
afterEach(() => { for (const c of clients) c.close(); removeTempDir(dir); });
const open = (name: string) => { const c = createClient({ url: pathToFileURL(join(dir, name)).href, concurrency: 1 }); clients.push(c); return c; };
const definitions = async (c: Client) => (await c.execute("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map(r => [r.type, r.name, r.tbl_name, r.sql]);

describe('career table statements', () => {
  it('create exactly the tables and indexes the repositories create', async () => {
    const viaRepositories = open('repos.db');
    await createRepository(viaRepositories).list();
    await createApplicationRepository(viaRepositories).listReadable();
    await createPracticeRepository(viaRepositories).listAll();
    const viaStatements = open('shared.db');
    await viaStatements.batch([...CAREER_TABLE_STATEMENTS], 'write');
    expect(await definitions(viaStatements)).toEqual(await definitions(viaRepositories));
    expect((await definitions(viaStatements)).filter(d => d[0] === 'table').map(d => d[1])).toEqual(['cv_version', 'cv_workspace', 'job_application', 'practice_attempt', 'practice_question']);
  });
});
