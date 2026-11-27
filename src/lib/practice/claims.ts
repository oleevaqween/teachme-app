import { bulletsOf, fieldText } from '@/lib/cv-studio/cv-text';
import { improveAnswerId } from '@/lib/cv-studio/improve-rules';
import type { ImproveAnswer } from '@/lib/cv-studio/improve-schema';
import type { Resume } from '@/lib/cv-studio/schema';
import type { EvidenceNumber } from './schema';

export type ClaimTarget = { target: string; bullet: string };

/** The CV text field that holds a claim target's bullets. */
export function claimField(target: string): string {
  return target === 'projects' ? 'projects' : target + '.achievements';
}

/** True when the bullet is still one of the target's bullets, compared exactly after trimming. */
export function hasBullet(resume: Resume, target: string, bullet: string): boolean {
  const text = fieldText(resume, claimField(target));
  return text !== null && bulletsOf(text).includes(bullet.trim());
}

// Keeps the standard question within the 1000-character question limit.
const QUOTE_LIMIT = 900;

/** The standard question used when the AI cannot write one. */
export function fallbackClaimQuestion(bullet: string): { question: string; guidance: string } {
  const trimmed = bullet.trim();
  const quoted = trimmed.length > QUOTE_LIMIT ? trimmed.slice(0, QUOTE_LIMIT).trimEnd() + '…' : trimmed;
  const sentence = /[.!?…]$/.test(quoted) ? quoted : quoted + '.';
  return {
    question: `Walk me through this: ${sentence} What did you personally do, and how do you know it worked?`,
    guidance: 'Say what the situation was, what you personally did and how you know it worked. Give the scale if you can: people, money, volume or time.',
  };
}

/** An answered Improve my CV entry built from a defended claim and the user's own answer. */
export function claimEvidence(q: { target: string; bullet: string; question: string }, answer: string, number: EvidenceNumber): ImproveAnswer {
  return {
    id: improveAnswerId(q.target, q.question), target: q.target, bullet: q.bullet.slice(0, 2000),
    question: q.question.slice(0, 2000), answer: answer.trim(), number, status: 'answered',
  };
}

/** The Mock Interview link that opens a claim question for one bullet. */
export function practiceClaimUrl(workspaceId: string, target: string, bullet: string): string {
  const query = new URLSearchParams({ target, bullet });
  return `/interview/practice/${encodeURIComponent(workspaceId)}?${query.toString()}`;
}

/** Reads the claim a practice page was opened for, or null when the link names none. */
export function claimFromSearch(search: string): ClaimTarget | null {
  const params = new URLSearchParams(search);
  const target = params.get('target')?.trim(), bullet = params.get('bullet')?.trim();
  return target && bullet ? { target, bullet } : null;
}
