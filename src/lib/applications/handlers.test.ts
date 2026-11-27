import { createClient, type Client } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRepository } from '@/lib/cv-studio/repository';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { createApplicationHandlers } from './handlers';
import { createApplicationRepository } from './repository';
import { blankApplicationInput } from './schema';
import { versionLabelReader } from './sent';

const url = 'http://localhost/api/applications';
const call = (method: string, body?: unknown) =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

// Throwaway database per test; never career.db.
let client: Client;
let handlers: ReturnType<typeof createApplicationHandlers>;
beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teachme-applications-api-'));
  client = createClient({ url: pathToFileURL(join(dir, 'test.db')).href });
  const cv = createRepository(client);
  await cv.save({ ...fixture(), id: 'master', kind: 'master', parentId: null, name: 'Master CV' }, 0);
  await cv.save({ ...fixture(), id: 'cv-1', name: 'Acme PM' }, 0);
  handlers = createApplicationHandlers({ applications: createApplicationRepository(client), workspaces: () => cv.listReadable(), versions: versionLabelReader(client) });
});
afterEach(() => client.close());

describe('/api/applications handlers', () => {
  it('lists CV Studio applications as virtual rows', async () => {
    const response = await handlers.GET(call('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applications.map((r: { key: string }) => r.key)).toEqual(['cv:cv-1']);
    expect(body.cvOptions).toEqual([{ id: 'cv-1', name: 'Acme PM' }]);
    expect(body.unreadable).toBe(0);
  });

  it('creates, updates and deletes an outside application', async () => {
    const created = await handlers.POST(call('POST', { application: blankApplicationInput({ company: 'Globex', role: 'Delivery Lead' }) }));
    expect(created.status).toBe(201);
    const entry = await created.json();
    const updated = await handlers.PUT(call('PUT', { id: entry.id, application: { ...blankApplicationInput({ company: 'Globex', role: 'Delivery Lead' }), status: 'interviewing' }, revision: 1 }));
    expect(updated.status).toBe(200);
    expect((await updated.json()).history).toHaveLength(2);
    const deleted = await handlers.DELETE(call('DELETE', { id: entry.id, revision: 2 }));
    expect(deleted.status).toBe(200);
    expect((await (await handlers.GET(call('GET'))).json()).applications).toHaveLength(1);
  });

  it('returns 409 for a stale revision and 400 with a readable message for bad input', async () => {
    const entry = await (await handlers.POST(call('POST', { application: blankApplicationInput({ company: 'Globex', role: 'Lead' }) }))).json();
    const stale = await handlers.PUT(call('PUT', { id: entry.id, application: blankApplicationInput({ company: 'Globex', role: 'Lead' }), revision: 5 }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toMatch(/another tab/);
    const bad = await handlers.POST(call('POST', { application: blankApplicationInput({ company: 'Globex', role: 'Lead', jobUrl: 'javascript:alert(1)' }) }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/http/);
  });

  it('records the downloaded CV when an entry changes to Applied, and PATCH refreshes it', async () => {
    const add = (id: string, label: string, at: string) => client.execute({ sql: 'INSERT INTO cv_version VALUES (?, ?, ?, ?, ?)', args: [id, 'cv-1', label, '{}', at] });
    await add('v1', 'Exported cv PDF', '2026-11-16T12:00:00.000Z');
    const draft = blankApplicationInput({ company: 'Acme', role: 'PM', workspaceId: 'cv-1', status: 'preparing' });
    const entry = await (await handlers.POST(call('POST', { application: draft }))).json();
    const applied = await (await handlers.PUT(call('PUT', { id: entry.id, application: { ...draft, status: 'applied' }, revision: 1 }))).json();
    expect(applied.sent.cv).toMatchObject({ versionId: 'v1', label: 'Exported cv PDF' });
    expect(applied.appliedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await add('v2', 'Exported cv PDF', '2026-11-17T12:00:00.000Z');
    const refreshed = await handlers.PATCH(call('PATCH', { id: entry.id, revision: 2 }));
    expect(refreshed.status).toBe(200);
    expect((await refreshed.json()).sent.cv.versionId).toBe('v2');
    expect((await handlers.PATCH(call('PATCH', { id: entry.id, revision: 2 }))).status).toBe(409);
  });

  it('refuses bad dates and over-long screening answers with plain messages', async () => {
    const bad = await handlers.POST(call('POST', { application: { ...blankApplicationInput({ company: 'A', role: 'B' }), postedOn: '18/11/2026' } }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('Enter a date as YYYY-MM-DD.');
    const long = await handlers.POST(call('POST', { application: { ...blankApplicationInput({ company: 'A', role: 'B' }), screening: { salary: 'x'.repeat(501) } } }));
    expect(long.status).toBe(400);
    expect((await long.json()).error).toBe('Answers must be 500 characters or fewer.');
  });

  it('PATCH refuses an outside application with the link message', async () => {
    const entry = await (await handlers.POST(call('POST', { application: blankApplicationInput({ company: 'Globex', role: 'Lead' }) }))).json();
    const response = await handlers.PATCH(call('PATCH', { id: entry.id, revision: 1 }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Link this application to a CV in CV Studio to record what you sent.');
  });

  it('refuses requests that are not from this computer', async () => {
    const remote = await handlers.GET(new Request('http://example.com/api/applications'));
    expect(remote.status).toBe(400);
  });
});
