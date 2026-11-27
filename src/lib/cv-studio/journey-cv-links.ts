import { z } from 'zod';

/** Browser-only memory of which Teach Me journeys came from a CV Studio gap; nothing is written to dev.db. */
export const journeyCvLinksKey = 'teachme.journey-cv-links.v1';

/** At most this many links are kept; the oldest are dropped first. */
export const MAX_JOURNEY_CV_LINKS = 50;

export const JourneyCvLinkSchema = z.object({
  journeyId: z.string().trim().min(1).max(120),
  topic: z.string().trim().min(1).max(200),
  role: z.string().trim().max(200).default(''),
  company: z.string().trim().max(200).default(''),
  applicationId: z.string().trim().min(1).max(80),
});

export type JourneyCvLink = z.infer<typeof JourneyCvLinkSchema>;

type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** window.localStorage, or null on the server or when the browser blocks storage. */
export function browserLocalStorage(): LocalStorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Every valid saved link, oldest first; bad JSON or bad entries are ignored. */
function readLinks(storage: LocalStorageLike): JourneyCvLink[] {
  const raw = storage.getItem(journeyCvLinksKey);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    const result = JourneyCvLinkSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

/**
 * Remembers which CV Studio application a journey came from. A link for the same journey
 * is replaced; beyond MAX_JOURNEY_CV_LINKS the oldest are dropped. Returns the saved link,
 * or null when the input is incomplete or storage fails (nothing breaks either way).
 */
export function rememberJourneyCvLink(
  storage: LocalStorageLike | null,
  link: z.input<typeof JourneyCvLinkSchema>
): JourneyCvLink | null {
  if (!storage) return null;
  try {
    const entry = JourneyCvLinkSchema.parse(link);
    const links = [...readLinks(storage).filter((l) => l.journeyId !== entry.journeyId), entry];
    storage.setItem(journeyCvLinksKey, JSON.stringify(links.slice(-MAX_JOURNEY_CV_LINKS)));
    return entry;
  } catch {
    return null;
  }
}

/** The remembered link for a journey, or null (none, bad data or storage errors). */
export function findJourneyCvLink(storage: LocalStorageLike | null, journeyId: string): JourneyCvLink | null {
  if (!storage) return null;
  try {
    return readLinks(storage).find((l) => l.journeyId === journeyId) ?? null;
  } catch {
    return null;
  }
}

/** "You've finished learning TOPIC for ROLE at COMPANY.", with role and company only when known. */
export function finishedLearningLine(link: Pick<JourneyCvLink, 'topic' | 'role' | 'company'>): string {
  const role = link.role.trim();
  const company = link.company.trim();
  return `You've finished learning ${link.topic}${role ? ` for ${role}` : ''}${company ? ` at ${company}` : ''}.`;
}

export const LEARNING_IS_NOT_EXPERIENCE =
  "Learning alone isn't experience. When you've used it in a project, exercise or task, add it as evidence so your CV can say so truthfully.";

/** /cv-studio?open=APPLICATION_ID&evidence=TOPIC, encoded. */
export function cvEvidenceHref(link: Pick<JourneyCvLink, 'applicationId' | 'topic'>): string {
  return '/cv-studio?' + new URLSearchParams({ open: link.applicationId, evidence: link.topic }).toString();
}
