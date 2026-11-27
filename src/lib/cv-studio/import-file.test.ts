import { describe, expect, it } from 'vitest';
import { importFileProblem } from './import-file';

describe('importFileProblem', () => {
  it('accepts PDF and DOCX files whatever the case of the extension', () => {
    expect(importFileProblem('Amara CV.pdf')).toBeNull();
    expect(importFileProblem('cv.DOCX')).toBeNull();
  });

  it('explains what to do with any other file', () => {
    expect(importFileProblem('cv.doc')).toMatch(/Only PDF or DOCX/);
    expect(importFileProblem('photo.png')).toMatch(/paste the text/);
    expect(importFileProblem('pdf')).not.toBeNull();
  });
});
