/**
 * Widths for a Teach Me stage (chosen by the user in a side-by-side mockup, 2026-11-26).
 * Full class strings on purpose: Tailwind only generates classes it can see written out.
 */

/** The whole stage view: header, messages and message box (up to 1280px). */
export const LESSON_PAGE = 'mx-auto flex h-[calc(100vh-4rem)] w-full max-w-7xl flex-col px-(--space-page-inline) py-4';

/** The reading column shared by the header, the messages and the message box (up to 1152px). */
export const READING_COLUMN = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
