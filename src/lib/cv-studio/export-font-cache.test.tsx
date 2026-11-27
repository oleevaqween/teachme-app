import { describe, it, expect } from 'vitest';
import { fixture } from './test-fixture';
import { exportDocument } from './export';

// This file runs in its own process so the font glyph cache starts cold.
describe('PDF font glyph cache', () => {
  it('keeps a Calibri PDF verifiable after a Georgia + Calibri PDF with an accented capital in a bold line', async () => {
    const first = fixture(); first.layout.fontPair = 'georgia-calibri';
    first.resume.experience[0].company = 'Ìbàdàn Holdings';
    expect((await exportDocument(first, 'pdf')).verification.textVerified).toBe(true);
    const second = fixture(); second.layout.fontPair = 'calibri';
    expect((await exportDocument(second, 'pdf')).verification.textVerified).toBe(true);
  }, 60000);
});
