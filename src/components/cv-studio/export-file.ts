/** What /api/cv-studio/export returns with delivery "json". */
export type ExportReply = { contentBase64: string; mediaType: string; verification: { pages: number | null; sha256: string; fontNotice?: string } };

export const TRANSFER_UNVERIFIED = 'The document transfer could not be verified. Please retry.';

/** The exported file, once its bytes match the server's SHA-256; throws when they do not. */
export async function verifiedBlob(data: ExportReply): Promise<Blob> {
  const bytes = Uint8Array.from(atob(data.contentBase64), character => character.charCodeAt(0));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
  if (!bytes.length || digest !== data.verification.sha256) throw new Error(TRANSFER_UNVERIFIED);
  return new Blob([bytes], { type: data.mediaType });
}

/** The notice shown after a checked export. */
export function exportNotice(report: ExportReply['verification']): string {
  return 'Export text and reading order checked' + (report.pages ? ' · ' + report.pages + ' page' + (report.pages > 1 ? 's' : '') : '') + '.' + (report.fontNotice ? ' ' + report.fontNotice : '');
}

export type ExportSteps = {
  /** True to show the exact PDF instead of downloading it. */
  view: boolean;
  /** The version label for a download, such as "Exported cv PDF". */
  label: string;
  /** Saves the CV: with no label only unsaved edits are saved and no version is made. */
  save: (label?: string) => Promise<void>;
  fetchExport: () => Promise<ExportReply>;
  show: (blob: Blob) => void;
  download: (blob: Blob) => void;
};

/**
 * One export, returning the notice to show. The "Exported ..." version is the tracker's record that a file was downloaded,
 * so it is saved only after the file was made and passed its check, immediately before the browser gets the file.
 * A failed export or check saves no such version; viewing the exact PDF never saves one.
 */
export async function runExport(steps: ExportSteps): Promise<string> {
  await steps.save();
  const data = await steps.fetchExport();
  const blob = await verifiedBlob(data);
  if (steps.view) steps.show(blob);
  else {
    await steps.save(steps.label);
    steps.download(blob);
  }
  return exportNotice(data.verification);
}
