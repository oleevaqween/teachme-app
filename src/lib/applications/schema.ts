import { z } from 'zod';
import { ScreeningAnswersSchema } from './screening';

/** Statuses in pipeline order; sorting by status follows this order. */
export const applicationStatuses = ['preparing', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn', 'no-response'] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const statusLabels: Record<ApplicationStatus, string> = {
  preparing: 'Preparing',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  'no-response': 'No response',
};

/** Trims a pasted link and adds https:// when it has no scheme; any existing scheme is left for the server to judge. */
export function withWebScheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** True only for http(s) links, so a saved link can never run script when clicked. */
export function isWebLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const optional = (max: number, label: string) => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);
const required = (label: string) => z.string().trim().min(1, `${label} is required.`).max(300, `${label} must be 300 characters or fewer.`);
const status = z.enum(applicationStatuses);

/** Plain message for anything that is not a real YYYY-MM-DD date. */
export const DATE_FORMAT = 'Enter a date as YYYY-MM-DD.';
const day = z.iso.date(DATE_FORMAT);

export const HistoryEntrySchema = z.object({ at: z.iso.datetime(), from: status.nullable(), to: status });
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

const SentFileSchema = z.object({ versionId: z.string().min(1).max(200), label: z.string().max(200), at: z.string().min(1).max(100) });
/** The CV Studio downloads recorded when the application went to Applied; owned by the server. */
export const SentSchema = z.object({
  cv: SentFileSchema.optional(),
  letter: SentFileSchema.optional(),
  checkedAt: z.iso.datetime(),
  failed: z.boolean().optional(),
});
export type SentFile = z.infer<typeof SentFileSchema>;
export type Sent = z.infer<typeof SentSchema>;

export const TrackedApplicationSchema = z.object({
  id,
  workspaceId: id.nullable(),
  company: required('Company'),
  role: required('Role'),
  status,
  jobUrl: optional(2000, 'Job link').refine(v => v === '' || isWebLink(v), 'The job link must start with http:// or https://.'),
  location: optional(300, 'Location'),
  salary: optional(300, 'Salary'),
  contact: z.object({
    name: optional(300, 'Contact name'),
    email: optional(300, 'Email').refine(v => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address, or leave it blank.'),
    phone: optional(100, 'Phone'),
    source: optional(300, 'How you found it'),
  }),
  notes: z.string().max(12000, 'Notes must be 12000 characters or fewer.'),
  postedOn: day.optional(),
  closesOn: day.optional(),
  appliedOn: day.optional(),
  /** This job's own screening answers; a missing id means "use my standard answer". */
  screening: ScreeningAnswersSchema.optional(),
  sent: SentSchema.optional(),
  history: z.array(HistoryEntrySchema).max(500),
  createdAt: z.iso.datetime(),
});
export type TrackedApplication = z.infer<typeof TrackedApplicationSchema>;
export type SavedApplication = TrackedApplication & { revision: number; updatedAt: string };

/** What the browser may send; id, history, createdAt and sent are owned by the server. */
const InputShapeSchema = TrackedApplicationSchema.omit({ id: true, history: true, createdAt: true, sent: true });
export const ApplicationInputSchema = InputShapeSchema.transform((input): z.infer<typeof InputShapeSchema> => {
  // Empty per-job overrides are dropped on save; screening is left out entirely when nothing remains.
  const { screening, ...rest } = input;
  const kept = Object.entries(screening ?? {}).filter(([, answer]) => answer.trim() !== '');
  return kept.length ? { ...rest, screening: Object.fromEntries(kept) as NonNullable<typeof screening> } : rest;
});
export type ApplicationInput = z.infer<typeof ApplicationInputSchema>;

export function blankApplicationInput(overrides: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    workspaceId: null, company: '', role: '', status: 'applied', jobUrl: '', location: '', salary: '',
    contact: { name: '', email: '', phone: '', source: '' }, notes: '',
    ...overrides,
  };
}

export function toInput(app: TrackedApplication): ApplicationInput {
  const { workspaceId, company, role, status: current, jobUrl, location, salary, contact, notes, postedOn, closesOn, appliedOn, screening } = app;
  return {
    workspaceId, company, role, status: current, jobUrl, location, salary, contact: { ...contact }, notes,
    // Optional fields are only present when set, so older entries compare exactly as before.
    ...(postedOn ? { postedOn } : {}),
    ...(closesOn ? { closesOn } : {}),
    ...(appliedOn ? { appliedOn } : {}),
    ...(screening ? { screening: { ...screening } } : {}),
  };
}
