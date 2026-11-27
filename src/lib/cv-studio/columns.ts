import type { Layout, Resume } from './schema';
import { repairOrder, sectionKeys, type SectionKey } from './sections';
import { sectionBlocks } from './blocks';

/** Two-column styles. No `columns` on a layout means one column. */
export const columnStyles = ['right', 'left', 'panel'] as const;
export type ColumnStyle = (typeof columnStyles)[number];

export const columnStyleNames: Record<ColumnStyle | 'one', string> = {
  one: 'One column', right: 'Side column right', left: 'Side column left', panel: 'Coloured side panel',
};
export const columnStyleDescriptions: Record<ColumnStyle | 'one', string> = {
  one: 'Every section in one column', right: 'Short sections in a narrow column on the right',
  left: 'Short sections in a narrow column on the left', panel: 'Name, contact and short sections in a colour band',
};

/** Sections that start in the side column until the user moves them. */
export const defaultSideSections: readonly SectionKey[] = ['skills', 'education', 'languages', 'certifications', 'strengths', 'interests', 'awards', 'training', 'references'];

export const COLUMNS_ATS_NOTE = 'Some online application systems read one column more reliably.';
export const COLUMNS_EMPTY_NOTE = 'Both columns need at least one section with content; until then the CV prints as one column.';

/** The sections placed in the side column: the saved choice, or the defaults. */
export function sideSet(layout: Pick<Layout, 'sideSections'>): Set<SectionKey> {
  return new Set(layout.sideSections ?? defaultSideSections);
}

export type ColumnPlan = { style: ColumnStyle; main: SectionKey[]; side: SectionKey[] };

/**
 * Which sections print in each column, in section order. Null for a one-column layout, and also when either
 * column would hold no section that prints text, so the CV never prints with an empty column.
 */
export function columnPlan(layout: Pick<Layout, 'order' | 'columns' | 'sideSections'>, resume: Resume): ColumnPlan | null {
  if (!layout.columns) return null;
  const side = sideSet(layout);
  const keys = repairOrder(layout.order, resume).filter(key => sectionBlocks(resume, key).length > 0);
  const plan = { style: layout.columns, main: keys.filter(key => !side.has(key)), side: keys.filter(key => side.has(key)) };
  return plan.main.length && plan.side.length ? plan : null;
}

/** The side sections after moving one section into (side true) or out of the side column, in default section order. */
export function toggleSide(layout: Pick<Layout, 'sideSections'>, key: SectionKey, side: boolean): SectionKey[] {
  const set = sideSet(layout);
  if (side) set.add(key); else set.delete(key);
  return sectionKeys.filter(k => set.has(k));
}
