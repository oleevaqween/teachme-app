/** Restore types, labels and messages shared by the server and the Settings card; no Node imports. */
export const RESTORE_KINDS = ['cvWorkspaces', 'cvVersions', 'applications', 'practiceQuestions', 'practiceAttempts'] as const;
export type RestoreKind = (typeof RESTORE_KINDS)[number];

export const kindLabels: Record<RestoreKind, string> = {
  cvWorkspaces: 'CVs', cvVersions: 'Saved versions', applications: 'Tracked applications',
  practiceQuestions: 'Practice questions', practiceAttempts: 'Practice attempts',
};

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const NOT_BACKUP = "This isn't a TeachMe career backup file.";
export const NEWER_BACKUP = 'This backup was made by a newer version of TeachMe.';
export const TOO_LARGE = 'The file is too large (50 MB at most).';
export const UNKNOWN_ACTION = 'Unknown restore action.';
export const MISSING_FINGERPRINT = 'Check the file before restoring it.';
export const CHECK_FAILED = 'The file could not be checked. Please try again.';
export const RESTORE_FAILED = 'The restore could not be completed. Nothing was changed.';
export const CHANGED = 'Your data changed since you checked the file. Check it again.';
export const SAFETY_FAILED = 'A safety copy could not be made, so nothing was restored.';
export const RELOAD_TABS = 'Reload any open CV Studio tabs to see restored CVs.';
/** Shown when the career database file itself cannot be read; the user sets it aside by hand because the running app keeps it open. */
export const damagedMessage = (path: string) =>
  `Your CV database could not be read; it looks damaged. To restore: close TeachMe, rename the file ${path} to career-damaged.db, or another name not already used in that folder (keep it, do not delete it), start TeachMe again and restore your backup here.`;

export const UNREADABLE = 'Unreadable in the backup.';
export const INVALID = "Doesn't match the app's format.";
export const REPEATED = 'Repeated in the file.';
export const LINK_TAKEN = 'This CV already has a tracked application.';
export const AT_LIMIT = 'This application already has the maximum of 40 extra questions.';

export type KindSummary = { inFile: number; added: number; same: number; kept: number; skipped: number };
/** What a restore does with the backup's screening answers; they are added only when the app has none. */
export type ScreeningOutcome = 'add' | 'same' | 'kept' | 'skip';
export const SCREENING_LABEL = 'Screening answers';
export const screeningOutcomeText: Record<ScreeningOutcome, string> = {
  add: 'will be added', same: 'already here', kept: 'kept yours', skip: 'skipped (still safe in your backup file)',
};

/** What a check returns: counts per kind, the items skipped or kept, and the fingerprint the restore must match. */
export type RestoreView = {
  exportedAt: string;
  summary: Record<RestoreKind, KindSummary>;
  versionCopies: number;
  addCount: number;
  fingerprint: string;
  skipped: { kind: RestoreKind; name: string; reason: string }[];
  kept: { kind: RestoreKind; name: string; versionCopy: boolean }[];
  /** Only when the file has screening answers. */
  screeningProfile?: ScreeningOutcome;
};

export type RestoreResultView = { summary: Record<RestoreKind, KindSummary>; versionCopies: number; addCount: number; safetyCopy: string | null; screeningProfileAdded?: boolean };

/** "16 Nov 2026" for an ISO timestamp, in the server's local time. */
export function backupDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
