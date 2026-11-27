import type { sectionKeys } from './schema';

export type SectionKey = (typeof sectionKeys)[number];

/** Moves one section to a new position; always returns a new array and leaves the input unchanged. */
export function moveSection(order: readonly SectionKey[], from: number, to: number): SectionKey[] {
  const next = [...order];
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < next.length;
  if (from === to || !valid(from) || !valid(to)) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
