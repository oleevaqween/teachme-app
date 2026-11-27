/** File types the CV import accepts, for the picker's `accept` and for files dropped on the upload box. */
export const IMPORT_ACCEPT = '.pdf,.docx';

/** Why a dropped or chosen file cannot be imported, or null when it can (the server still checks its size and text). */
export function importFileProblem(name: string): string | null {
  return /\.(pdf|docx)$/i.test(name.trim()) ? null : 'Only PDF or DOCX files can be imported. Choose another file, or paste the text below.';
}
