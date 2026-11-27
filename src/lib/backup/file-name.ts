/** Backup download name with the local date, e.g. teachme-career-backup-2026-11-15.json. */
export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `teachme-career-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = /filename="?([^";]+)"?/i.exec(header ?? '');
  return match ? match[1] : fallback;
}
