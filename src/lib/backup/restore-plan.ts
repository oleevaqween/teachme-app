import { createHash, randomUUID } from 'node:crypto';
import { TrackedApplicationSchema } from '@/lib/applications/schema';
import { ScreeningProfileBodySchema } from '@/lib/applications/screening';
import { WorkspaceSchema } from '@/lib/cv-studio/schema';
import { AttemptSchema, MAX_EXTRA_QUESTIONS, PracticeQuestionSchema } from '@/lib/practice/schema';
import { BACKUP_FORMAT, BACKUP_VERSION } from './export';
import {
  AT_LIMIT, backupDateLabel, INVALID, LINK_TAKEN, NEWER_BACKUP, NOT_BACKUP, REPEATED, RESTORE_KINDS, UNREADABLE,
  type KindSummary, type RestoreKind, type RestoreView, type ScreeningOutcome,
} from './restore-view';

export class RestoreFileError extends Error {}

/** A backup file that passed the whole-file checks; its rows are still unchecked. */
export type BackupFile = { exportedAt: string; rows: Record<RestoreKind, unknown[]>; screeningProfile?: unknown };
/** One row already in the app; `body` is the stored JSON text. */
export type CurrentRow = { id: string; workspaceId: string | null; body: string };
/** `screeningProfile` is the stored body text of the app's screening answers, when it has some. */
export type CurrentData = Record<RestoreKind, CurrentRow[]> & { screeningProfile?: string };
type Value = string | number | null;
type InsertKind = RestoreKind | 'screeningProfile';
export type Insert = { kind: InsertKind; args: Value[] };
export type PlanItem = { kind: RestoreKind; id: string; name: string; outcome: 'add' | 'same' | 'kept' | 'skip'; reason?: string; versionCopy?: boolean };
export type RestorePlan = {
  exportedAt: string; items: PlanItem[]; inserts: Insert[]; summary: Record<RestoreKind, KindSummary>;
  versionCopies: number; addCount: number; fingerprint: string;
  /** What happens to the file's screening answers; null when the file has none. */
  screeningProfile: ScreeningOutcome | null;
};

/** Column order matches each insert's args. */
export const INSERT_SQL: Record<InsertKind, string> = {
  cvWorkspaces: 'INSERT INTO cv_workspace (id, body, revision, updated_at) VALUES (?, ?, ?, ?)',
  cvVersions: 'INSERT INTO cv_version (id, workspace_id, label, body, created_at) VALUES (?, ?, ?, ?, ?)',
  applications: 'INSERT INTO job_application (id, workspace_id, body, revision, updated_at) VALUES (?, ?, ?, ?, ?)',
  practiceQuestions: 'INSERT INTO practice_question (id, workspace_id, body, created_at) VALUES (?, ?, ?, ?)',
  practiceAttempts: 'INSERT INTO practice_attempt (id, workspace_id, question_key, body, created_at) VALUES (?, ?, ?, ?, ?)',
  screeningProfile: 'INSERT INTO screening_profile (id, body, revision, updated_at) VALUES (?, ?, ?, ?)',
};

export function emptyCurrent(): CurrentData {
  return { cvWorkspaces: [], cvVersions: [], applications: [], practiceQuestions: [], practiceAttempts: [] };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const revision = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const short = (s: string) => (s.length > 80 ? s.slice(0, 79) + '…' : s);

/** JSON with object keys sorted, so the same content always compares equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function canonicalText(stored: string): string | null {
  try { return canonical(JSON.parse(stored)); } catch { return null; }
}

export function parseBackupFile(source: string): BackupFile {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new RestoreFileError(NOT_BACKUP); }
  if (!isObject(value) || value.format !== BACKUP_FORMAT) throw new RestoreFileError(NOT_BACKUP);
  if (typeof value.version === 'number' && value.version > BACKUP_VERSION) throw new RestoreFileError(NEWER_BACKUP);
  if (value.version !== BACKUP_VERSION || typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt))) throw new RestoreFileError(NOT_BACKUP);
  const rows = {} as Record<RestoreKind, unknown[]>;
  for (const kind of RESTORE_KINDS) {
    const list = value[kind];
    if (!Array.isArray(list)) throw new RestoreFileError(NOT_BACKUP);
    rows[kind] = list;
  }
  return { exportedAt: value.exportedAt, rows, ...(value.screeningProfile !== undefined ? { screeningProfile: value.screeningProfile } : {}) };
}

/** A display name read loosely from a row's body (no schema check), so even skipped items are recognisable; falls back to "Item N". */
function readableName(kind: RestoreKind, raw: unknown, index: number): string {
  const fallback = `Item ${index + 1}`;
  if (!isObject(raw) || !isObject(raw.body)) return fallback;
  const body = raw.body;
  const field = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const joined = (...parts: unknown[]) => parts.map(field).filter(Boolean).join(' · ');
  const name = kind === 'cvWorkspaces' ? field(body.name)
    : kind === 'cvVersions' ? (field(body.name) ? joined(raw.label, body.name) : '')
    : kind === 'applications' ? joined(body.company, body.role)
    : kind === 'practiceQuestions' ? field(body.question)
    : field(body.questionText);
  return name ? short(name) : fallback;
}

type Checked = { ok: true; id: string; name: string; workspaceId: string | null; body: unknown; args: Value[] } | { ok: false; id: string; name: string; reason: string };

/** Validates one file row with the schema the app reads it with, and checks its columns agree with its body. */
function checkRow(kind: RestoreKind, raw: unknown, index: number): Checked {
  const fallback = readableName(kind, raw, index);
  if (!isObject(raw)) return { ok: false, id: `#${index + 1}`, name: fallback, reason: INVALID };
  const id = text(raw.id) ? raw.id : `#${index + 1}`;
  if (raw.bodyUnreadable === true) return { ok: false, id, name: fallback, reason: UNREADABLE };
  const body = raw.body, json = JSON.stringify(body);
  const invalid = (name: string): Checked => ({ ok: false, id, name, reason: INVALID });
  switch (kind) {
    case 'cvWorkspaces': {
      const parsed = WorkspaceSchema.safeParse(body);
      if (!parsed.success) return invalid(fallback);
      if (parsed.data.id !== raw.id || !revision(raw.revision) || !text(raw.updatedAt)) return invalid(parsed.data.name);
      return { ok: true, id, name: parsed.data.name, workspaceId: null, body, args: [id, json, raw.revision, raw.updatedAt] };
    }
    case 'cvVersions': {
      const parsed = WorkspaceSchema.safeParse(body);
      if (!parsed.success) return invalid(fallback);
      const name = `${typeof raw.label === 'string' ? raw.label : 'Version'} · ${parsed.data.name}`;
      if (!text(raw.id) || !text(raw.workspaceId) || parsed.data.id !== raw.workspaceId || typeof raw.label !== 'string' || !text(raw.createdAt)) return invalid(name);
      return { ok: true, id, name, workspaceId: raw.workspaceId, body, args: [id, raw.workspaceId, raw.label, json, raw.createdAt] };
    }
    case 'applications': {
      const parsed = TrackedApplicationSchema.safeParse(body);
      if (!parsed.success) return invalid(fallback);
      const name = `${parsed.data.company} · ${parsed.data.role}`;
      const workspaceId = raw.workspaceId === null ? null : text(raw.workspaceId) ? raw.workspaceId : undefined;
      if (workspaceId === undefined || parsed.data.id !== raw.id || parsed.data.workspaceId !== workspaceId || !revision(raw.revision) || !text(raw.updatedAt)) return invalid(name);
      return { ok: true, id, name, workspaceId, body, args: [id, workspaceId, json, raw.revision, raw.updatedAt] };
    }
    case 'practiceQuestions': {
      const parsed = PracticeQuestionSchema.safeParse(body);
      if (!parsed.success) return invalid(fallback);
      const name = short(parsed.data.question);
      if (parsed.data.id !== raw.id || !text(raw.workspaceId) || parsed.data.workspaceId !== raw.workspaceId || !text(raw.createdAt)) return invalid(name);
      return { ok: true, id, name, workspaceId: raw.workspaceId, body, args: [id, raw.workspaceId, json, raw.createdAt] };
    }
    case 'practiceAttempts': {
      const parsed = AttemptSchema.safeParse(body);
      if (!parsed.success) return invalid(fallback);
      const name = short(parsed.data.questionText);
      if (parsed.data.id !== raw.id || !text(raw.workspaceId) || parsed.data.workspaceId !== raw.workspaceId
        || !text(raw.questionKey) || parsed.data.questionKey !== raw.questionKey || !text(raw.createdAt)) return invalid(name);
      return { ok: true, id, name, workspaceId: raw.workspaceId, body, args: [id, raw.workspaceId, raw.questionKey, json, raw.createdAt] };
    }
  }
}

/** The backup's screening answers are added only when the app has none; the app's own answers are never changed. */
function planScreening(raw: unknown, stored: string | undefined): { outcome: ScreeningOutcome; insert?: Insert } {
  if (!isObject(raw) || raw.bodyUnreadable === true || !revision(raw.revision) || !text(raw.updatedAt)) return { outcome: 'skip' };
  if (!ScreeningProfileBodySchema.safeParse(raw.body).success) return { outcome: 'skip' };
  if (stored !== undefined) return { outcome: canonicalText(stored) === canonical(raw.body) ? 'same' : 'kept' };
  return { outcome: 'add', insert: { kind: 'screeningProfile', args: ['me', JSON.stringify(raw.body), raw.revision, raw.updatedAt] } };
}

// Versions first, so a kept CV's backup copy is not added when the same content is being restored as a version anyway.
const PLAN_ORDER: RestoreKind[] = ['cvVersions', 'cvWorkspaces', 'applications', 'practiceQuestions', 'practiceAttempts'];

/**
 * Decides, for every item in the file, whether it is added, already here, kept as the app has it, or skipped.
 * Pure: it never touches a database. `newId` names the saved versions created for kept CVs.
 */
export function planRestore(file: BackupFile, current: CurrentData, now: Date, newId: () => string = randomUUID): RestorePlan {
  const items: PlanItem[] = [];
  const inserts: Insert[] = [];
  const label = 'From backup ' + backupDateLabel(file.exportedAt);
  const versionBodies = new Map<string, Set<string>>();
  const noteVersion = (workspaceId: string | null, body: string | null) => {
    if (!workspaceId || body === null) return;
    if (!versionBodies.has(workspaceId)) versionBodies.set(workspaceId, new Set());
    versionBodies.get(workspaceId)!.add(body);
  };
  for (const row of current.cvVersions) noteVersion(row.workspaceId, canonicalText(row.body));
  const linked = new Set(current.applications.map(row => row.workspaceId).filter((ws): ws is string => !!ws));
  const questionCounts = new Map<string, number>();
  for (const row of current.practiceQuestions) if (row.workspaceId) questionCounts.set(row.workspaceId, (questionCounts.get(row.workspaceId) ?? 0) + 1);

  for (const kind of PLAN_ORDER) {
    const existing = new Map(current[kind].map(row => [row.id, row.body]));
    const seen = new Set<string>();
    file.rows[kind].forEach((raw, index) => {
      const rawId = isObject(raw) && text(raw.id) ? raw.id : null;
      if (rawId !== null && seen.has(rawId)) { items.push({ kind, id: rawId, name: readableName(kind, raw, index), outcome: 'skip', reason: REPEATED }); return; }
      if (rawId !== null) seen.add(rawId);
      const row = checkRow(kind, raw, index);
      if (!row.ok) { items.push({ kind, id: row.id, name: row.name, outcome: 'skip', reason: row.reason }); return; }
      const fileBody = canonical(row.body);
      const stored = existing.get(row.id);
      if (stored !== undefined) {
        if (canonicalText(stored) === fileBody) { items.push({ kind, id: row.id, name: row.name, outcome: 'same' }); return; }
        if (kind !== 'cvWorkspaces') { items.push({ kind, id: row.id, name: row.name, outcome: 'kept' }); return; }
        const versionCopy = !versionBodies.get(row.id)?.has(fileBody);
        if (versionCopy) {
          inserts.push({ kind: 'cvVersions', args: [newId(), row.id, label, JSON.stringify(row.body), now.toISOString()] });
          noteVersion(row.id, fileBody);
        }
        items.push({ kind, id: row.id, name: row.name, outcome: 'kept', versionCopy });
        return;
      }
      if (kind === 'applications' && row.workspaceId && linked.has(row.workspaceId)) { items.push({ kind, id: row.id, name: row.name, outcome: 'skip', reason: LINK_TAKEN }); return; }
      if (kind === 'practiceQuestions' && row.workspaceId) {
        const count = questionCounts.get(row.workspaceId) ?? 0;
        if (count >= MAX_EXTRA_QUESTIONS) { items.push({ kind, id: row.id, name: row.name, outcome: 'skip', reason: AT_LIMIT }); return; }
        questionCounts.set(row.workspaceId, count + 1);
      }
      if (kind === 'applications' && row.workspaceId) linked.add(row.workspaceId);
      if (kind === 'cvVersions') noteVersion(row.workspaceId, fileBody);
      inserts.push({ kind, args: row.args });
      items.push({ kind, id: row.id, name: row.name, outcome: 'add' });
    });
  }

  const screening = file.screeningProfile === undefined ? null : planScreening(file.screeningProfile, current.screeningProfile);
  if (screening?.insert) inserts.push(screening.insert);

  const summary = Object.fromEntries(RESTORE_KINDS.map(kind => {
    const mine = items.filter(i => i.kind === kind);
    const count = (outcome: PlanItem['outcome']) => mine.filter(i => i.outcome === outcome).length;
    return [kind, { inFile: file.rows[kind].length, added: count('add'), same: count('same'), kept: count('kept'), skipped: count('skip') }];
  })) as Record<RestoreKind, KindSummary>;
  const marks = items.map(i => [i.kind, i.id, i.outcome, i.reason ?? '', i.versionCopy ? 1 : 0]);
  // Only a file with screening answers adds a mark, so an older backup keeps exactly the same fingerprint.
  if (screening) marks.push(['screeningProfile', 'me', screening.outcome, '', 0]);
  const fingerprint = createHash('sha256').update(JSON.stringify(marks)).digest('hex');
  return {
    exportedAt: file.exportedAt, items, inserts, summary,
    versionCopies: items.filter(i => i.versionCopy).length, addCount: inserts.length, fingerprint,
    screeningProfile: screening?.outcome ?? null,
  };
}

/** What the Settings card shows for a plan. */
export function toView(plan: RestorePlan): RestoreView {
  return {
    exportedAt: plan.exportedAt, summary: plan.summary, versionCopies: plan.versionCopies, addCount: plan.addCount, fingerprint: plan.fingerprint,
    skipped: plan.items.filter(i => i.outcome === 'skip').map(i => ({ kind: i.kind, name: i.name, reason: i.reason ?? '' })),
    kept: plan.items.filter(i => i.outcome === 'kept').map(i => ({ kind: i.kind, name: i.name, versionCopy: !!i.versionCopy })),
    ...(plan.screeningProfile ? { screeningProfile: plan.screeningProfile } : {}),
  };
}
