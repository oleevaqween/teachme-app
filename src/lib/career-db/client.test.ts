import type { Client } from '@libsql/client';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';

// Every career connection in this file points at a fresh temp dir, never .data or .integration-data.
const dir = makeTempDir('teachme-career-client-');
const careerUrl = pathToFileURL(join(dir, 'career.db')).href;
vi.mock('@/lib/cv-studio/storage-path', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/cv-studio/storage-path')>()),
  careerDatabaseUrl: () => careerUrl,
}));

type CareerGlobal = typeof globalThis & { __teachmeCareerClient?: Client };

afterAll(() => {
  const store = globalThis as CareerGlobal;
  store.__teachmeCareerClient?.close();
  delete store.__teachmeCareerClient;
  removeTempDir(dir);
});

describe('shared career database client', () => {
  it('uses the temp database in this test', async () => {
    const { careerDatabaseUrl } = await import('@/lib/cv-studio/storage-path');
    expect(careerDatabaseUrl()).toBe(careerUrl);
  });

  it('returns one client, even after a hot reload re-imports the module', async () => {
    const first = (await import('./client')).getCareerClient();
    expect((await import('./client')).getCareerClient()).toBe(first);
    vi.resetModules();
    expect((await import('./client')).getCareerClient()).toBe(first);
  });

  it('opens a fresh client if the shared one was closed', async () => {
    vi.resetModules();
    const { getCareerClient } = await import('./client');
    const first = getCareerClient();
    first.close();
    const fresh = getCareerClient();
    expect(fresh).not.toBe(first);
    expect(fresh.closed).toBe(false);
    await expect(fresh.execute('SELECT 1')).resolves.toBeDefined();
  });

  it('is the client behind CV Studio, the tracker and practice', async () => {
    vi.resetModules();
    const client = (await import('./client')).getCareerClient();
    const execute = vi.spyOn(client, 'execute');
    const calls = () => execute.mock.calls.length;

    await (await import('@/lib/cv-studio/repository')).getRepository().list();
    const afterCv = calls();
    expect(afterCv).toBeGreaterThan(0);

    await (await import('@/lib/applications/repository')).getApplicationRepository().listReadable();
    const afterTracker = calls();
    expect(afterTracker).toBeGreaterThan(afterCv);

    await (await import('@/lib/practice/repository')).getPracticeRepository().listAll();
    expect(calls()).toBeGreaterThan(afterTracker);
    execute.mockRestore();
  });
});
