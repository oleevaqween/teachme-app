import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { blankApplicationInput } from '@/lib/applications/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { packQuestionKey } from '@/lib/practice/question-key';
import { emptyCurrent, INSERT_SQL, parseBackupFile, planRestore, RestoreFileError, toView, type BackupFile, type CurrentData, type CurrentRow } from './restore-plan';
import { AT_LIMIT, INVALID, LINK_TAKEN, NEWER_BACKUP, NOT_BACKUP, REPEATED, UNREADABLE, type RestoreKind } from './restore-view';

const at = '2026-11-16T09:00:00.000Z';
const now = new Date('2026-11-16T15:30:00.000Z');
const ids = () => { let n = 0; return () => 'new-' + ++n; };

const cv = (id: string, name = 'Master CV') => ({ ...fixture(), id, name, kind: 'master' as const, parentId: null });
const application = (id: string, workspaceId: string | null) => ({ ...blankApplicationInput({ workspaceId, company: 'Acme', role: 'PM' }), id, history: [], createdAt: at });
const question = (id: string, workspaceId: string) => ({ id, workspaceId, question: 'Why Acme?', guidance: '', kind: 'company' as const, createdAt: at });
const attempt = (id: string, workspaceId: string) => ({
  id, workspaceId, questionKey: packQuestionKey('Tell me about a budget you managed.'), questionText: 'Tell me about a budget you managed.', followUpOf: null,
  answer: 'I managed the yearly budget and reported monthly.', durationSeconds: 80, inputMethod: 'typed' as const, score: 7,
  star: { situation: { rating: 'strong' as const, note: '' }, task: { rating: 'weak' as const, note: '' }, action: { rating: 'strong' as const, note: '' }, result: { rating: 'missing' as const, note: '' } },
  fixes: ['Add the outcome.'], rewrite: null, rewriteWithheld: null, followUpQuestion: null, createdAt: at,
});

const cvRow = (body: ReturnType<typeof cv>, revision = 3) => ({ id: body.id, revision, updatedAt: at, body });
const versionRow = (id: string, body: ReturnType<typeof cv>, label = 'Created') => ({ id, workspaceId: body.id, label, createdAt: at, body });
const applicationRow = (body: ReturnType<typeof application>, revision = 2) => ({ id: body.id, workspaceId: body.workspaceId, revision, updatedAt: at, body });
const questionRow = (body: ReturnType<typeof question>) => ({ id: body.id, workspaceId: body.workspaceId, createdAt: body.createdAt, body });
const attemptRow = (body: ReturnType<typeof attempt>) => ({ id: body.id, workspaceId: body.workspaceId, questionKey: body.questionKey, createdAt: body.createdAt, body });

const file = (rows: Partial<Record<RestoreKind, unknown[]>>): BackupFile => ({
  exportedAt: at, rows: { cvWorkspaces: [], cvVersions: [], applications: [], practiceQuestions: [], practiceAttempts: [], ...rows },
});
const current = (rows: Partial<Record<RestoreKind, CurrentRow[]>>): CurrentData => ({ ...emptyCurrent(), ...rows });
const outcomes = (plan: ReturnType<typeof planRestore>) => plan.items.map(i => [i.kind, i.id, i.outcome, i.reason ?? '']);

describe('parseBackupFile', () => {
  const valid = { format: 'teachme-career-backup', version: 1, exportedAt: at, counts: {}, cvWorkspaces: [], cvVersions: [], applications: [], practiceQuestions: [], practiceAttempts: [] };
  it('accepts a v1 backup', () => {
    expect(parseBackupFile(JSON.stringify(valid))).toEqual(file({}));
  });
  it.each([
    ['not JSON', 'nope'],
    ['an array', '[]'],
    ['another format', JSON.stringify({ ...valid, format: 'other' })],
    ['version 0', JSON.stringify({ ...valid, version: 0 })],
    ['a text version', JSON.stringify({ ...valid, version: '1' })],
    ['a missing list', JSON.stringify({ ...valid, practiceAttempts: undefined })],
    ['a bad date', JSON.stringify({ ...valid, exportedAt: 'yesterday' })],
  ])('refuses %s as not a backup', (_, text) => {
    expect(() => parseBackupFile(text)).toThrow(new RestoreFileError(NOT_BACKUP));
  });
  it('refuses a newer version with its own message', () => {
    expect(() => parseBackupFile(JSON.stringify({ ...valid, version: 2 }))).toThrow(NEWER_BACKUP);
  });
});

describe('planRestore', () => {
  it('adds every valid item to an empty app, exactly as in the file', () => {
    const master = cv('master'), app = application('a1', 'master'), q = question('q1', 'master'), t = attempt('t1', 'master');
    const plan = planRestore(file({ cvWorkspaces: [cvRow(master)], cvVersions: [versionRow('v1', master)], applications: [applicationRow(app)], practiceQuestions: [questionRow(q)], practiceAttempts: [attemptRow(t)] }), emptyCurrent(), now, ids());
    expect(plan.items.every(i => i.outcome === 'add')).toBe(true);
    expect(plan.addCount).toBe(5);
    const args = Object.fromEntries(plan.inserts.map(i => [i.kind, i.args]));
    expect(args.cvWorkspaces).toEqual(['master', JSON.stringify(master), 3, at]);
    expect(args.cvVersions).toEqual(['v1', 'master', 'Created', JSON.stringify(master), at]);
    expect(args.applications).toEqual(['a1', 'master', JSON.stringify(app), 2, at]);
    expect(args.practiceQuestions).toEqual(['q1', 'master', JSON.stringify(q), at]);
    expect(args.practiceAttempts).toEqual(['t1', 'master', t.questionKey, JSON.stringify(t), at]);
    expect(INSERT_SQL.cvWorkspaces).toBe('INSERT INTO cv_workspace (id, body, revision, updated_at) VALUES (?, ?, ?, ?)');
  });

  it('counts identical items as already here, even with keys in another order', () => {
    const master = cv('master');
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(master).reverse()));
    const plan = planRestore(file({ cvWorkspaces: [cvRow(master)] }), current({ cvWorkspaces: [{ id: 'master', workspaceId: null, body: reordered }] }), now, ids());
    expect(outcomes(plan)).toEqual([['cvWorkspaces', 'master', 'same', '']]);
    expect(plan.inserts).toEqual([]);
  });

  it("keeps the app's CV when it differs and saves the backup copy as a version once", () => {
    const backupCopy = cv('master'), appCopy = cv('master', 'Master CV (edited)');
    const plan = planRestore(file({ cvWorkspaces: [cvRow(backupCopy)] }), current({ cvWorkspaces: [{ id: 'master', workspaceId: null, body: JSON.stringify(appCopy) }] }), now, ids());
    expect(plan.items).toEqual([expect.objectContaining({ kind: 'cvWorkspaces', id: 'master', outcome: 'kept', versionCopy: true })]);
    expect(plan.inserts).toEqual([{ kind: 'cvVersions', args: ['new-1', 'master', 'From backup 16 Nov 2026', JSON.stringify(backupCopy), now.toISOString()] }]);
    expect(plan.versionCopies).toBe(1);

    const already = current({ cvWorkspaces: [{ id: 'master', workspaceId: null, body: JSON.stringify(appCopy) }], cvVersions: [{ id: 'v0', workspaceId: 'master', body: JSON.stringify(backupCopy) }] });
    expect(planRestore(file({ cvWorkspaces: [cvRow(backupCopy)] }), already, now, ids()).inserts).toEqual([]);

    const withFileVersion = planRestore(file({ cvWorkspaces: [cvRow(backupCopy)], cvVersions: [versionRow('v9', backupCopy)] }), current({ cvWorkspaces: [{ id: 'master', workspaceId: null, body: JSON.stringify(appCopy) }] }), now, ids());
    expect(withFileVersion.inserts.map(i => i.kind)).toEqual(['cvVersions']);
    expect(withFileVersion.inserts[0].args[0]).toBe('v9');
  });

  it("keeps the app's copy of any other item that differs, without writing", () => {
    const app = application('a1', null), q = question('q1', 'master'), t = attempt('t1', 'master'), master = cv('master');
    const plan = planRestore(
      file({ cvVersions: [versionRow('v1', master)], applications: [applicationRow(app)], practiceQuestions: [questionRow(q)], practiceAttempts: [attemptRow(t)] }),
      current({
        cvVersions: [{ id: 'v1', workspaceId: 'master', body: JSON.stringify(cv('master', 'Other')) }],
        applications: [{ id: 'a1', workspaceId: null, body: JSON.stringify({ ...app, company: 'Other' }) }],
        practiceQuestions: [{ id: 'q1', workspaceId: 'master', body: JSON.stringify({ ...q, question: 'Other?' }) }],
        practiceAttempts: [{ id: 't1', workspaceId: 'master', body: 'not json' }],
      }), now, ids());
    expect(plan.items.map(i => i.outcome)).toEqual(['kept', 'kept', 'kept', 'kept']);
    expect(plan.inserts).toEqual([]);
  });

  it('skips an application whose CV already has a different tracked application', () => {
    const plan = planRestore(
      file({ applications: [applicationRow(application('a-new', 'app-1')), applicationRow(application('a-2', 'app-2')), applicationRow(application('a-3', 'app-2')), applicationRow(application('a-free', null)), applicationRow(application('a-free-2', null))] }),
      current({ applications: [{ id: 'a-old', workspaceId: 'app-1', body: JSON.stringify(application('a-old', 'app-1')) }] }), now, ids());
    expect(outcomes(plan)).toEqual([
      ['applications', 'a-new', 'skip', LINK_TAKEN], ['applications', 'a-2', 'add', ''], ['applications', 'a-3', 'skip', LINK_TAKEN],
      ['applications', 'a-free', 'add', ''], ['applications', 'a-free-2', 'add', ''],
    ]);
  });

  it('stops adding practice questions at 40 per application', () => {
    const existing = Array.from({ length: 39 }, (_, i) => ({ id: 'old' + i, workspaceId: 'app-1', body: JSON.stringify(question('old' + i, 'app-1')) }));
    const plan = planRestore(file({ practiceQuestions: ['n1', 'n2', 'n3'].map(id => questionRow(question(id, 'app-1'))) }), current({ practiceQuestions: existing }), now, ids());
    expect(outcomes(plan)).toEqual([['practiceQuestions', 'n1', 'add', ''], ['practiceQuestions', 'n2', 'skip', AT_LIMIT], ['practiceQuestions', 'n3', 'skip', AT_LIMIT]]);
  });

  it('skips unreadable, invalid, mismatched and repeated items', () => {
    const master = cv('master'), t = attempt('t1', 'master');
    const plan = planRestore(file({
      cvWorkspaces: [
        { id: 'broken', revision: 1, updatedAt: at, body: '{oops', bodyUnreadable: true },
        { ...cvRow(master), body: { ...master, name: '' } },
        { ...cvRow(cv('other')), id: 'not-other' },
        { ...cvRow(cv('zero')), revision: 0 },
        'not an object',
        cvRow(master), cvRow(master),
      ],
      cvVersions: [{ ...versionRow('v1', master), workspaceId: 'elsewhere' }],
      practiceAttempts: [{ ...attemptRow(t), questionKey: 'extra:different' }],
    }), emptyCurrent(), now, ids());
    expect(outcomes(plan)).toEqual([
      ['cvVersions', 'v1', 'skip', INVALID],
      ['cvWorkspaces', 'broken', 'skip', UNREADABLE],
      ['cvWorkspaces', 'master', 'skip', INVALID],
      ['cvWorkspaces', 'not-other', 'skip', INVALID],
      ['cvWorkspaces', 'zero', 'skip', INVALID],
      ['cvWorkspaces', '#5', 'skip', INVALID],
      ['cvWorkspaces', 'master', 'skip', REPEATED],
      ['cvWorkspaces', 'master', 'skip', REPEATED],
      ['practiceAttempts', 't1', 'skip', INVALID],
    ]);
  });

  it('skips a saved version without an id, and items whose columns disagree with their bodies', () => {
    const master = cv('master');
    const plan = planRestore(file({
      cvVersions: [{ ...versionRow('v1', master), id: undefined }],
      applications: [{ ...applicationRow(application('a1', 'master')), workspaceId: 'other' }],
      practiceQuestions: [{ ...questionRow(question('q1', 'master')), workspaceId: 'other' }],
    }), emptyCurrent(), now, ids());
    expect(outcomes(plan)).toEqual([
      ['cvVersions', '#1', 'skip', INVALID],
      ['applications', 'a1', 'skip', INVALID],
      ['practiceQuestions', 'q1', 'skip', INVALID],
    ]);
    expect(plan.inserts).toEqual([]);
  });

  it('fingerprints the decisions only, not new ids or the time', () => {
    const master = cv('master'), appCopy = cv('master', 'Edited');
    const f = file({ cvWorkspaces: [cvRow(master)], applications: [applicationRow(application('a1', 'master'))] });
    const c = current({ cvWorkspaces: [{ id: 'master', workspaceId: null, body: JSON.stringify(appCopy) }] });
    const a = planRestore(f, c, now, ids()), b = planRestore(f, c, new Date('2027-01-01T00:00:00.000Z'), () => 'other-id');
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(planRestore(f, emptyCurrent(), now, ids()).fingerprint).not.toBe(a.fingerprint);
  });

  it('summarises counts and lists skipped and kept items by name', () => {
    const master = cv('master'), appCopy = cv('master', 'Edited');
    const plan = planRestore(file({
      cvWorkspaces: [cvRow(master), cvRow(cv('second', 'Second CV'))],
      applications: [applicationRow(application('a-new', 'app-1'))],
    }), current({
      cvWorkspaces: [{ id: 'master', workspaceId: null, body: JSON.stringify(appCopy) }],
      applications: [{ id: 'a-old', workspaceId: 'app-1', body: '{}' }],
    }), now, ids());
    expect(plan.summary.cvWorkspaces).toEqual({ inFile: 2, added: 1, same: 0, kept: 1, skipped: 0 });
    expect(plan.summary.applications).toEqual({ inFile: 1, added: 0, same: 0, kept: 0, skipped: 1 });
    expect(plan.addCount).toBe(2);
    const view = toView(plan);
    expect(view.skipped).toEqual([{ kind: 'applications', name: 'Acme · PM', reason: LINK_TAKEN }]);
    expect(view.kept).toEqual([{ kind: 'cvWorkspaces', name: 'Master CV', versionCopy: true }]);
    expect(view).toMatchObject({ exportedAt: at, addCount: 2, versionCopies: 1, fingerprint: plan.fingerprint });
  });

  it('names skipped items by what can be read of them, not just their position', () => {
    const master = cv('master', 'Master CV'), app = application('a1', 'master'), q = question('q1', 'master');
    const plan = planRestore(file({
      cvWorkspaces: [cvRow(master), cvRow(master), { ...cvRow(cv('broken', 'Broken CV')), revision: 0 }, { id: 'u', revision: 1, updatedAt: at, body: 'x', bodyUnreadable: true }],
      cvVersions: [{ ...versionRow('v1', master, 'Created'), workspaceId: 'elsewhere' }],
      applications: [applicationRow(app), applicationRow(app)],
      practiceQuestions: [questionRow(q), questionRow(q)],
    }), emptyCurrent(), now, ids());
    expect(toView(plan).skipped.map(s => s.name)).toEqual(['Created · Master CV', 'Master CV', 'Broken CV', 'Item 4', 'Acme · PM', 'Why Acme?']);
  });
});

describe('screening answers in a backup', () => {
  const valid = { format: 'teachme-career-backup', version: 1, exportedAt: at, counts: {}, cvWorkspaces: [], cvVersions: [], applications: [], practiceQuestions: [], practiceAttempts: [] };
  const profile = (answers: Record<string, string> = { 'uk-right': 'Yes' }) => ({ revision: 2, updatedAt: at, body: { answers } });
  const withProfile = (raw: unknown, rows: Partial<Record<RestoreKind, unknown[]>> = {}): BackupFile => ({ ...file(rows), screeningProfile: raw });

  it('reads the optional field, and plans older files exactly as before', () => {
    expect(parseBackupFile(JSON.stringify({ ...valid, screeningProfile: profile() }))).toEqual(withProfile(profile()));
    expect(parseBackupFile(JSON.stringify(valid))).not.toHaveProperty('screeningProfile');
    const old = planRestore(file({ cvWorkspaces: [cvRow(cv('master'))] }), emptyCurrent(), now, ids());
    expect(old.screeningProfile).toBeNull();
    expect(toView(old)).not.toHaveProperty('screeningProfile');
    const legacy = createHash('sha256').update(JSON.stringify(old.items.map(i => [i.kind, i.id, i.outcome, i.reason ?? '', i.versionCopy ? 1 : 0]))).digest('hex');
    expect(old.fingerprint).toBe(legacy);
  });

  it('adds the answers only when the app has none', () => {
    const add = planRestore(withProfile(profile()), emptyCurrent(), now, ids());
    expect(add.screeningProfile).toBe('add');
    expect(add.addCount).toBe(1);
    expect(add.inserts).toEqual([{ kind: 'screeningProfile', args: ['me', JSON.stringify({ answers: { 'uk-right': 'Yes' } }), 2, at] }]);
    expect(INSERT_SQL.screeningProfile).toBe('INSERT INTO screening_profile (id, body, revision, updated_at) VALUES (?, ?, ?, ?)');
    const kept = planRestore(withProfile(profile()), { ...emptyCurrent(), screeningProfile: JSON.stringify({ answers: { 'uk-right': 'No' } }) }, now, ids());
    expect([kept.screeningProfile, kept.addCount]).toEqual(['kept', 0]);
    expect(toView(kept).screeningProfile).toBe('kept');
    const same = planRestore(withProfile(profile()), { ...emptyCurrent(), screeningProfile: JSON.stringify({ answers: { 'uk-right': 'Yes' } }) }, now, ids());
    expect([same.screeningProfile, same.addCount]).toEqual(['same', 0]);
  });

  it('skips answers that are unreadable or do not match the format', () => {
    for (const raw of [{ ...profile(), bodyUnreadable: true }, profile({ pets: 'cat' }), profile({ salary: 'x'.repeat(501) }), { ...profile(), revision: 0 }, 'nope']) {
      const plan = planRestore(withProfile(raw), emptyCurrent(), now, ids());
      expect([plan.screeningProfile, plan.addCount]).toEqual(['skip', 0]);
    }
  });

  it('puts the answers outcome in the fingerprint', () => {
    const a = planRestore(withProfile(profile()), emptyCurrent(), now, ids());
    const b = planRestore(withProfile(profile()), { ...emptyCurrent(), screeningProfile: '{"answers":{}}' }, now, ids());
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
