import { createClient, type Client } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@/lib/cv-studio/repository';
import { createApplicationRepository, LINK_TAKEN, UNREADABLE_ENTRY } from './repository';
import { CV_STUDIO_TABLE_STATEMENTS } from '@/lib/career-db/tables';
import { localDate, NOT_LINKED } from './hygiene';
import { blankApplicationInput, toInput, type ApplicationInput } from './schema';
import { sentFinder, versionLabelReader, type FindSent } from './sent';

// Every test gets a throwaway database in the OS temp folder; never career.db.
let client: Client;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'teachme-applications-'));
  client = createClient({ url: pathToFileURL(join(dir, 'test.db')).href });
});
afterEach(() => client.close());

const t0 = new Date('2026-11-15T10:00:00.000Z');
const t1 = new Date('2026-11-16T09:30:00.000Z');
const acme = () => blankApplicationInput({ company: 'Acme', role: 'Project Manager' });

describe('application repository', () => {
  it('retries start-up after a failed init instead of caching the failure', async () => {
    let calls = 0;
    const flaky = {
      batch: (...args: Parameters<Client['batch']>) => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('disk busy')) : client.batch(...args);
      },
      execute: (...args: Parameters<Client['execute']>) => client.execute(...args),
      transaction: (...args: Parameters<Client['transaction']>) => client.transaction(...args),
    } as unknown as Client;
    const repo = createApplicationRepository(flaky);
    await expect(repo.listReadable()).rejects.toThrow('disk busy');
    expect((await repo.listReadable()).applications).toEqual([]);
    expect(calls).toBe(2);
  });

  it('creates an entry with a starting history line', async () => {
    const repo = createApplicationRepository(client);
    const saved = await repo.create(acme(), t0);
    expect(saved.revision).toBe(1);
    expect(saved.createdAt).toBe(t0.toISOString());
    expect(saved.history).toEqual([{ at: t0.toISOString(), from: null, to: 'applied' }]);
    expect((await repo.listReadable()).applications.map(a => a.company)).toEqual(['Acme']);
  });

  it('appends history only when the status changes', async () => {
    const repo = createApplicationRepository(client);
    const saved = await repo.create(acme(), t0);
    const noted = await repo.update(saved.id, { ...toInput(saved), notes: 'Called recruiter' }, 1, t1);
    expect(noted.revision).toBe(2);
    expect(noted.history).toHaveLength(1);
    const moved = await repo.update(saved.id, { ...toInput(noted), status: 'interviewing' }, 2, t1);
    expect(moved.history.at(-1)).toEqual({ at: t1.toISOString(), from: 'applied', to: 'interviewing' });
    expect(moved.createdAt).toBe(t0.toISOString());
  });

  it('rejects stale revisions without writing', async () => {
    const repo = createApplicationRepository(client);
    const saved = await repo.create(acme(), t0);
    await repo.update(saved.id, { ...toInput(saved), notes: 'First tab' }, 1);
    await expect(repo.update(saved.id, { ...toInput(saved), notes: 'Second tab' }, 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.remove(saved.id, 1)).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.listReadable()).applications[0].notes).toBe('First tab');
  });

  it('allows only one entry per CV, and unlinking frees it', async () => {
    const repo = createApplicationRepository(client);
    const first = await repo.create({ ...acme(), workspaceId: 'cv-1' });
    await expect(repo.create({ ...acme(), company: 'Globex', workspaceId: 'cv-1' })).rejects.toThrow(LINK_TAKEN);
    await repo.update(first.id, { ...toInput(first), workspaceId: null }, 1);
    const second = await repo.create({ ...acme(), company: 'Globex', workspaceId: 'cv-1' });
    expect(second.workspaceId).toBe('cv-1');
  });

  it('deletes only the chosen entry', async () => {
    const repo = createApplicationRepository(client);
    const a = await repo.create(acme());
    await repo.create({ ...acme(), company: 'Globex' });
    expect(await repo.remove(a.id, 1)).toEqual({ id: a.id });
    expect((await repo.listReadable()).applications.map(x => x.company)).toEqual(['Globex']);
  });

  it('skips unreadable rows instead of failing', async () => {
    const repo = createApplicationRepository(client);
    await repo.create(acme());
    await client.execute({ sql: 'INSERT INTO job_application VALUES (?, ?, ?, ?, ?)', args: ['bad', null, '{"id":"bad"}', 1, t0.toISOString()] });
    const { applications, unreadable } = await repo.listReadable();
    expect(applications).toHaveLength(1);
    expect(unreadable).toEqual(['bad']);
  });

  it('refuses invalid input before touching the database', async () => {
    const repo = createApplicationRepository(client);
    await expect(repo.create({ ...acme(), jobUrl: 'javascript:alert(1)' })).rejects.toThrow();
    expect((await repo.listReadable()).applications).toHaveLength(0);
  });
});

describe('application hygiene in the repository', () => {
  const linked = () => blankApplicationInput({ company: 'Acme', role: 'PM', workspaceId: 'cv-1', status: 'preparing' });
  const addVersion = async (id: string, label: string, createdAt: string, workspaceId = 'cv-1') => {
    await client.batch([...CV_STUDIO_TABLE_STATEMENTS], 'write');
    await client.execute({ sql: 'INSERT INTO cv_version VALUES (?, ?, ?, ?, ?)', args: [id, workspaceId, label, '{}', createdAt] });
  };
  const finder = () => sentFinder(versionLabelReader(client));

  it('fills Applied on once, on the first change to Applied, and never overwrites or refills it', async () => {
    const repo = createApplicationRepository(client);
    const saved = await repo.create(linked(), t0);
    expect(saved.appliedOn).toBeUndefined();
    const applied = await repo.update(saved.id, { ...toInput(saved), status: 'applied' }, 1, t1);
    expect(applied.appliedOn).toBe(localDate(t1));
    const edited = await repo.update(saved.id, { ...toInput(applied), appliedOn: '2026-11-01' }, 2, t1);
    expect(edited.appliedOn).toBe('2026-11-01');
    const cleared = await repo.update(saved.id, { ...toInput(edited), appliedOn: undefined, status: 'interviewing' }, 3, t1);
    expect(cleared.appliedOn).toBeUndefined();
    const back = await repo.update(saved.id, { ...toInput(cleared), status: 'applied' }, 4, t1);
    expect(back.appliedOn).toBeUndefined();
  });

  it('fills Applied on when an entry is created as Applied, unless a date was given', async () => {
    const repo = createApplicationRepository(client);
    expect((await repo.create(blankApplicationInput({ company: 'A', role: 'B' }), t0)).appliedOn).toBe(localDate(t0));
    expect((await repo.create(blankApplicationInput({ company: 'A', role: 'B', appliedOn: '2026-11-02' }), t0)).appliedOn).toBe('2026-11-02');
  });

  it('records the newest CV and letter downloads when a linked entry changes to Applied, and keeps them on later saves', async () => {
    await addVersion('v-old', 'Exported cv PDF', '2026-11-10T12:00:00.000Z');
    await addVersion('v-new', 'Exported cv DOCX', '2026-11-17T12:00:00.000Z');
    await addVersion('v-letter', 'Exported letter PDF', '2026-11-16T12:00:00.000Z');
    await addVersion('v-edit', 'Edited', '2026-11-18T08:00:00.000Z');
    const repo = createApplicationRepository(client);
    const saved = await repo.create(linked(), t0, finder());
    expect(saved.sent).toBeUndefined();
    const applied = await repo.update(saved.id, { ...toInput(saved), status: 'applied' }, 1, t1, finder());
    expect(applied.sent).toEqual({
      cv: { versionId: 'v-new', label: 'Exported cv DOCX', at: '2026-11-17T12:00:00.000Z' },
      letter: { versionId: 'v-letter', label: 'Exported letter PDF', at: '2026-11-16T12:00:00.000Z' },
      checkedAt: t1.toISOString(),
    });
    const forged = { ...toInput(applied), notes: 'Sent today', sent: { checkedAt: t0.toISOString(), failed: true } } as ApplicationInput;
    const noted = await repo.update(saved.id, forged, 2, t1, finder());
    expect(noted.sent).toEqual(applied.sent);
  });

  it('still saves the change to Applied when the download check fails', async () => {
    const repo = createApplicationRepository(client);
    const saved = await repo.create(linked(), t0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing: FindSent = sentFinder(async () => { throw new Error('disk busy'); });
    const applied = await repo.update(saved.id, { ...toInput(saved), status: 'applied' }, 1, t1, failing);
    warn.mockRestore();
    expect(applied.status).toBe('applied');
    expect(applied.sent).toEqual({ checkedAt: t1.toISOString(), failed: true });
    expect((await repo.listReadable()).applications[0].sent).toEqual({ checkedAt: t1.toISOString(), failed: true });
  });

  it('looks up nothing for unlinked entries, and drops the record when the link changes', async () => {
    let calls = 0;
    const counting: FindSent = async (_workspaceId, now) => { calls += 1; return { checkedAt: now.toISOString() }; };
    const repo = createApplicationRepository(client);
    const outside = await repo.create(blankApplicationInput({ company: 'A', role: 'B', status: 'preparing' }), t0, counting);
    await repo.update(outside.id, { ...toInput(outside), status: 'applied' }, 1, t1, counting);
    expect(calls).toBe(0);
    const saved = await repo.create(linked(), t0, counting);
    const applied = await repo.update(saved.id, { ...toInput(saved), status: 'applied' }, 1, t1, counting);
    expect(calls).toBe(1);
    expect(applied.sent).toEqual({ checkedAt: t1.toISOString() });
    const unlinked = await repo.update(saved.id, { ...toInput(applied), workspaceId: null }, 2, t1, counting);
    expect(unlinked.sent).toBeUndefined();
    expect(calls).toBe(1);
  });

  it('Use my latest download refreshes the record, and refuses unlinked or stale entries', async () => {
    await addVersion('v1', 'Exported cv PDF', '2026-11-10T12:00:00.000Z');
    const repo = createApplicationRepository(client);
    const saved = await repo.create({ ...linked(), status: 'applied' }, t0, finder());
    expect(saved.sent?.cv?.versionId).toBe('v1');
    await addVersion('v2', 'Exported cv PDF', '2026-11-17T12:00:00.000Z');
    const refreshed = await repo.refreshSent(saved.id, 1, finder(), t1);
    expect(refreshed.revision).toBe(2);
    expect(refreshed.company).toBe('Acme');
    expect(refreshed.sent).toEqual({ cv: { versionId: 'v2', label: 'Exported cv PDF', at: '2026-11-17T12:00:00.000Z' }, checkedAt: t1.toISOString() });
    await expect(repo.refreshSent(saved.id, 1, finder(), t1)).rejects.toBeInstanceOf(ConflictError);
    const outside = await repo.create(blankApplicationInput({ company: 'A', role: 'B' }), t0);
    await expect(repo.refreshSent(outside.id, 1, finder(), t1)).rejects.toThrow(NOT_LINKED);
  });

  it('records what was sent once: a later return to Applied keeps it, and only Use my latest download replaces it', async () => {
    await addVersion('v1', 'Exported cv PDF', '2026-11-10T12:00:00.000Z');
    const repo = createApplicationRepository(client);
    const saved = await repo.create(linked(), t0, finder());
    const applied = await repo.update(saved.id, { ...toInput(saved), status: 'applied' }, 1, t1, finder());
    expect(applied.sent?.cv?.versionId).toBe('v1');
    const moved = await repo.update(saved.id, { ...toInput(applied), status: 'interviewing' }, 2, t1, finder());
    await addVersion('v2', 'Exported cv PDF', '2026-11-17T12:00:00.000Z');
    const back = await repo.update(saved.id, { ...toInput(moved), status: 'applied' }, 3, t1, finder());
    expect(back.sent?.cv?.versionId).toBe('v1');
    const refreshed = await repo.refreshSent(saved.id, 4, finder(), t1);
    expect(refreshed.sent?.cv?.versionId).toBe('v2');
  });

  it('looks up again on a return to Applied when the earlier lookup failed or the CV link changed', async () => {
    await addVersion('v1', 'Exported cv PDF', '2026-11-10T12:00:00.000Z');
    const repo = createApplicationRepository(client);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing: FindSent = sentFinder(async () => { throw new Error('disk busy'); });
    const saved = await repo.create(linked(), t0);
    const failed = await repo.update(saved.id, { ...toInput(saved), status: 'applied' }, 1, t1, failing);
    warn.mockRestore();
    expect(failed.sent?.failed).toBe(true);
    const moved = await repo.update(saved.id, { ...toInput(failed), status: 'interviewing' }, 2, t1, finder());
    const retried = await repo.update(saved.id, { ...toInput(moved), status: 'applied' }, 3, t1, finder());
    expect(retried.sent?.cv?.versionId).toBe('v1');
    await addVersion('w1', 'Exported cv DOCX', '2026-11-12T12:00:00.000Z', 'cv-2');
    const relinked = await repo.update(saved.id, { ...toInput(retried), status: 'interviewing', workspaceId: 'cv-2' }, 4, t1, finder());
    expect(relinked.sent).toBeUndefined();
    const again = await repo.update(saved.id, { ...toInput(relinked), status: 'applied' }, 5, t1, finder());
    expect(again.sent?.cv?.versionId).toBe('w1');
  });

  it('saves a status change even when a download label is very long, storing it cut to 200 characters', async () => {
    await addVersion('v-long', 'Exported cv ' + 'x'.repeat(288), '2026-11-10T12:00:00.000Z');
    const repo = createApplicationRepository(client);
    const saved = await repo.create(linked(), t0);
    const applied = await repo.update(saved.id, { ...toInput(saved), status: 'applied' }, 1, t1, finder());
    expect(applied.sent?.failed).toBeUndefined();
    expect(applied.sent?.cv?.label).toHaveLength(200);
    expect((await repo.listReadable()).applications[0].sent?.cv?.label).toHaveLength(200);
  });

  it('drops empty screening overrides when saving, and keeps real ones', async () => {
    const repo = createApplicationRepository(client);
    const saved = await repo.create({ ...acme(), screening: { 'uk-right': '  ', salary: '60k' } }, t0);
    const stored = JSON.parse(String((await client.execute('SELECT body FROM job_application')).rows[0].body));
    expect(stored.screening).toEqual({ salary: '60k' });
    await repo.update(saved.id, { ...toInput(saved), screening: { salary: '' } }, 1, t1);
    const after = JSON.parse(String((await client.execute('SELECT body FROM job_application')).rows[0].body));
    expect(after).not.toHaveProperty('screening');
  });

  it('says an unreadable entry could not be read when Use my latest download is pressed', async () => {
    const repo = createApplicationRepository(client);
    await repo.listReadable();
    await client.execute({ sql: 'INSERT INTO job_application VALUES (?, ?, ?, ?, ?)', args: ['bad', 'cv-1', '{not json', 1, t0.toISOString()] });
    await expect(repo.refreshSent('bad', 1, finder(), t1)).rejects.toThrow('This entry could not be read.');
    expect(UNREADABLE_ENTRY).toBe('This entry could not be read.');
  });

  it('saves an older-shaped row unchanged apart from the fields the server owns', async () => {
    const repo = createApplicationRepository(client);
    await repo.listReadable();
    const old = { ...blankApplicationInput({ company: 'Old Co', role: 'PM' }), id: 'old', history: [{ at: t0.toISOString(), from: null, to: 'applied' }], createdAt: t0.toISOString() };
    await client.execute({ sql: 'INSERT INTO job_application VALUES (?, ?, ?, ?, ?)', args: ['old', null, JSON.stringify(old), 1, t0.toISOString()] });
    const [entry] = (await repo.listReadable()).applications;
    const saved = await repo.update('old', toInput(entry), 1, t1, finder());
    const row = (await client.execute('SELECT body, revision, updated_at FROM job_application')).rows[0];
    expect(JSON.parse(String(row.body))).toEqual(old);
    expect(Number(row.revision)).toBe(2);
    expect(saved.revision).toBe(2);
  });

  it('reads tracker rows saved before these fields existed', async () => {
    const repo = createApplicationRepository(client);
    await repo.listReadable();
    const old = { ...blankApplicationInput({ company: 'Old Co', role: 'PM' }), id: 'old', history: [{ at: t0.toISOString(), from: null, to: 'applied' }], createdAt: t0.toISOString() };
    await client.execute({ sql: 'INSERT INTO job_application VALUES (?, ?, ?, ?, ?)', args: ['old', null, JSON.stringify(old), 1, t0.toISOString()] });
    const [entry] = (await repo.listReadable()).applications;
    expect(entry.company).toBe('Old Co');
    expect(Object.keys(toInput(entry)).sort()).toEqual(['company', 'contact', 'jobUrl', 'location', 'notes', 'role', 'salary', 'status', 'workspaceId']);
  });
});
