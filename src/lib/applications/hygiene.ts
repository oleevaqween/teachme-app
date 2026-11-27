import type { ApplicationStatus, Sent } from './schema';

export const APPLY_SOON = 'Many employers review applications as they arrive; apply soon if you can.';
export const NO_DOWNLOAD = 'No downloaded CV found for this application. Download it from CV Studio before you send it.';
export const NOT_LINKED = 'Link this application to a CV in CV Studio to record what you sent.';
export const LOOKUP_FAILED = 'Could not check your downloads; press Use my latest download to try again.';

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD for the given moment in this computer's local time. */
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from one YYYY-MM-DD date to another; positive when `to` is later. Counted in UTC so clock changes never matter. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/**
 * The apply-early line for a Preparing application, or null when there is nothing to say.
 * `today` is YYYY-MM-DD in the user's local time. Advice only.
 */
export function applyNudge(app: { status: ApplicationStatus; postedOn?: string; closesOn?: string }, today: string): string | null {
  if (app.status !== 'preparing') return null;
  const parts: string[] = [];
  let postedAgo: number | null = null;
  if (app.postedOn) {
    const ago = daysBetween(app.postedOn, today);
    // A posted date in the future is ignored.
    if (ago >= 0) {
      postedAgo = ago;
      parts.push(ago === 0 ? 'Posted today' : `Posted ${days(ago)} ago`);
    }
  }
  if (app.closesOn) {
    const left = daysBetween(today, app.closesOn);
    parts.push(left > 0 ? `closes in ${days(left)}` : left === 0 ? 'closes today' : `closed ${days(-left)} ago`);
  }
  if (!parts.length) return null;
  const joined = parts.join(' · ');
  const line = joined.charAt(0).toUpperCase() + joined.slice(1);
  return postedAgo !== null && postedAgo >= 7 ? `${line}. ${APPLY_SOON}` : line;
}

/** Fixed English month names, so the label never depends on the browser's language data. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "17 Nov 2026" for an ISO timestamp, in local time. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "PDF" from "Exported cv PDF". */
const formatOf = (label: string) => label.trim().split(/\s+/).at(-1) ?? '';

export type SentView = { line: string | null; message: string | null };

/** What the panel says about the files sent with an application. */
export function sentView(workspaceId: string | null, sent: Sent | undefined): SentView {
  if (!workspaceId) return { line: null, message: NOT_LINKED };
  if (!sent) return { line: null, message: null };
  if (sent.failed) return { line: null, message: LOOKUP_FAILED };
  const parts: string[] = [];
  if (sent.cv) parts.push(`CV ${formatOf(sent.cv.label)} downloaded ${dayLabel(sent.cv.at)}`);
  if (sent.letter) parts.push(`letter ${formatOf(sent.letter.label)} downloaded ${dayLabel(sent.letter.at)}`);
  return { line: parts.length ? `Sent: ${parts.join(' · ')}` : null, message: sent.cv ? null : NO_DOWNLOAD };
}
