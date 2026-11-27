import { createClient, type Client } from '@libsql/client';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '@/lib/testing/db-safety';
import { SCREENING_CONFLICT } from './screening';
import { createScreeningHandlers } from './screening-handlers';
import { createScreeningRepository } from './screening-repository';

const url = 'http://localhost/api/screening';
const call = (method: string, body?: unknown) =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

// Throwaway database per test; never career.db.
let dir: string;
let client: Client;
let handlers: ReturnType<typeof createScreeningHandlers>;
beforeEach(() => {
  dir = makeTempDir('teachme-screening-api-');
  client = createClient({ url: pathToFileURL(join(dir, 'career.db')).href });
  handlers = createScreeningHandlers({ screening: createScreeningRepository(client) });
});
afterEach(() => { client.close(); removeTempDir(dir); });

describe('/api/screening handlers', () => {
  it('GET returns empty answers and revision 0, then PUT saves with a revision check', async () => {
    const first = await handlers.GET(call('GET'));
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(await first.json()).toEqual({ answers: {}, revision: 0 });
    const saved = await handlers.PUT(call('PUT', { answers: { notice: 'Two weeks' }, revision: 0 }));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ answers: { notice: 'Two weeks' }, revision: 1 });
    const stale = await handlers.PUT(call('PUT', { answers: { notice: 'Now' }, revision: 0 }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe(SCREENING_CONFLICT);
    expect(await (await handlers.GET(call('GET'))).json()).toEqual({ answers: { notice: 'Two weeks' }, revision: 1 });
  });

  it('refuses over-long answers with a plain message', async () => {
    const response = await handlers.PUT(call('PUT', { answers: { salary: 'x'.repeat(501) }, revision: 0 }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Answers must be 500 characters or fewer.');
  });

  it('refuses requests that are not from this computer', async () => {
    expect((await handlers.GET(new Request('http://example.com/api/screening'))).status).toBe(400);
    expect((await handlers.PUT(new Request('http://example.com/api/screening', { method: 'PUT', body: '{}' }))).status).toBe(400);
  });
});

describe('/api/screening with damaged answers', () => {
  it('opens them empty, replaces them on a save with the same revision, and never overwrites a newer save', async () => {
    await handlers.PUT(call('PUT', { answers: { notice: 'One month' }, revision: 0 }));
    await client.execute("UPDATE screening_profile SET body = 'not json' WHERE id = 'me'");
    const opened = await handlers.GET(call('GET'));
    expect(opened.status).toBe(200);
    expect(await opened.json()).toEqual({ answers: {}, revision: 1, unreadable: true });
    const stale = await handlers.PUT(call('PUT', { answers: { notice: 'Now' }, revision: 0 }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe(SCREENING_CONFLICT);
    const row = (await client.execute("SELECT body, revision FROM screening_profile WHERE id = 'me'")).rows[0];
    expect([row.body, Number(row.revision)]).toEqual(['not json', 1]);
    const saved = await handlers.PUT(call('PUT', { answers: { notice: 'Two weeks' }, revision: 1 }));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ answers: { notice: 'Two weeks' }, revision: 2 });
    const olderTab = await handlers.PUT(call('PUT', { answers: { notice: 'Older tab' }, revision: 1 }));
    expect(olderTab.status).toBe(409);
    expect(await (await handlers.GET(call('GET'))).json()).toEqual({ answers: { notice: 'Two weeks' }, revision: 2 });
  });
});
