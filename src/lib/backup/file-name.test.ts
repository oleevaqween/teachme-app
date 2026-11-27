import { describe, expect, it } from 'vitest';
import { backupFileName, filenameFromDisposition } from './file-name';

describe('backup file names', () => {
  it('uses the local date', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 59))).toBe('teachme-career-backup-2026-11-05.json');
  });
  it('reads the file name from a Content-Disposition header, with a fallback', () => {
    expect(filenameFromDisposition('attachment; filename="teachme-career-backup-2026-11-15.json"', 'x.json')).toBe('teachme-career-backup-2026-11-15.json');
    expect(filenameFromDisposition(null, 'x.json')).toBe('x.json');
    expect(filenameFromDisposition('attachment', 'x.json')).toBe('x.json');
  });
});
