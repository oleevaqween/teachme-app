// src/lib/interview-engine/cv-refiner.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCV } from './cv-refiner';

// Mock the document parsers
vi.mock('@/lib/document-processor/pdf-parser', () => ({
  parsePdf: vi.fn(),
}));

vi.mock('@/lib/document-processor/docx-parser', () => ({
  parseDocx: vi.fn(),
}));

import { parsePdf } from '@/lib/document-processor/pdf-parser';
import { parseDocx } from '@/lib/document-processor/docx-parser';

describe('cv-refiner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCV', () => {
    it('should parse a PDF file and return CVContent with typed sections', async () => {
      const mockPdfResult = {
        content: {
          sections: [
            { title: 'Professional Summary', body: 'Experienced developer...' },
            { title: 'Work Experience', body: 'Company A - Senior Dev...' },
            { title: 'Education', body: 'BSc Computer Science...' },
            { title: 'Technical Skills', body: 'JavaScript, Python...' },
          ],
          rawText: 'Full raw CV text...',
          headings: ['Professional Summary', 'Work Experience', 'Education', 'Technical Skills'],
          totalCharacters: 200,
        },
        metadata: { wordCount: 40 },
      };

      vi.mocked(parsePdf).mockResolvedValue(mockPdfResult as unknown as Awaited<ReturnType<typeof parsePdf>>);

      const file = new File(['dummy content'], 'resume.pdf', { type: 'application/pdf' });
      const result = await parseCV(file);

      expect(result.sections).toHaveLength(4);
      expect(result.sections[0].type).toBe('summary');
      expect(result.sections[1].type).toBe('experience');
      expect(result.sections[2].type).toBe('education');
      expect(result.sections[3].type).toBe('skills');
      expect(result.rawText).toBe('Full raw CV text...');
    });

    it('should parse a DOCX file and return CVContent', async () => {
      const mockDocxResult = {
        content: {
          sections: [
            { title: 'About Me', body: 'I am a software engineer...' },
            { title: 'Employment History', body: 'Worked at XYZ Corp...' },
          ],
          rawText: 'About Me I am a software engineer...',
          headings: ['About Me', 'Employment History'],
          totalCharacters: 100,
        },
        metadata: { wordCount: 20 },
      };

      vi.mocked(parseDocx).mockResolvedValue(mockDocxResult as unknown as Awaited<ReturnType<typeof parseDocx>>);

      const file = new File(['dummy content'], 'cv.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = await parseCV(file);

      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].type).toBe('summary'); // "About Me" matches summary pattern
      expect(result.sections[1].type).toBe('experience'); // "Employment History" matches experience
    });

    it('should throw an error for unsupported file formats', async () => {
      const file = new File(['dummy'], 'document.txt', { type: 'text/plain' });
      await expect(parseCV(file)).rejects.toThrow(
        'Unsupported CV format ".txt". Accepted formats: PDF, DOCX.'
      );
    });

    it('should throw an error if parsing times out', async () => {
      vi.mocked(parsePdf).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 35_000))
      );

      const file = new File(['dummy'], 'slow.pdf', { type: 'application/pdf' });

      await expect(parseCV(file)).rejects.toThrow('CV parsing timed out after 30 seconds.');
    }, 35_000);

    it('should detect section types correctly from headings', async () => {
      const mockResult = {
        content: {
          sections: [
            { title: 'Career Objective', body: 'To obtain...' },
            { title: 'Professional Experience', body: 'Worked...' },
            { title: 'Academic Qualifications', body: 'PhD...' },
            { title: 'Core Competencies', body: 'Leadership...' },
            { title: 'Publications', body: 'Paper 1...' },
          ],
          rawText: 'Full text',
          headings: [],
          totalCharacters: 50,
        },
        metadata: { wordCount: 10 },
      };

      vi.mocked(parsePdf).mockResolvedValue(mockResult as unknown as Awaited<ReturnType<typeof parsePdf>>);

      const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' });
      const result = await parseCV(file);

      expect(result.sections[0].type).toBe('summary'); // "Objective" matches summary
      expect(result.sections[1].type).toBe('experience'); // "Professional" matches experience
      expect(result.sections[2].type).toBe('education'); // "Qualifications" matches education
      expect(result.sections[3].type).toBe('competencies'); // "Competencies" matches competencies
      expect(result.sections[4].type).toBe('other'); // "Publications" doesn't match any
    });
  });
});

describe('parseCV page count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const result = (metadata: Record<string, unknown>) => ({
    content: { sections: [{ title: 'Experience', body: 'Led weekly reviews.' }], rawText: 'Experience\nLed weekly reviews.', headings: [], totalCharacters: 30 },
    metadata,
  });

  it('returns the PDF page count when the parser reports it', async () => {
    vi.mocked(parsePdf).mockResolvedValue(result({ pageCount: 3, wordCount: 4 }) as unknown as Awaited<ReturnType<typeof parsePdf>>);
    const parsed = await parseCV(new File(['dummy'], 'cv.pdf', { type: 'application/pdf' }));
    expect(parsed.pages).toBe(3);
    expect(parsed.rawText).toBe('Experience\nLed weekly reviews.');
    expect(parsed.sections).toEqual([{ heading: 'Experience', content: 'Led weekly reviews.', type: 'experience' }]);
  });

  it('leaves the key out when the PDF page count is unknown, and for DOCX files', async () => {
    vi.mocked(parsePdf).mockResolvedValue(result({ wordCount: 4 }) as unknown as Awaited<ReturnType<typeof parsePdf>>);
    const pdf = await parseCV(new File(['dummy'], 'cv.pdf', { type: 'application/pdf' }));
    expect(Object.keys(pdf).sort()).toEqual(['rawText', 'sections']);
    vi.mocked(parseDocx).mockResolvedValue(result({ pageCount: 2, wordCount: 4 }) as unknown as Awaited<ReturnType<typeof parseDocx>>);
    const docx = await parseCV(new File(['dummy'], 'cv.docx'));
    expect(Object.keys(docx).sort()).toEqual(['rawText', 'sections']);
  });
});
