// src/lib/interview-engine/cv-refiner.ts

import { parsePdf } from '@/lib/document-processor/pdf-parser';
import { parseDocx } from '@/lib/document-processor/docx-parser';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CVContent {
  sections: CVSection[];
  rawText: string;
  /** The PDF's page count when the parser reports one; absent for DOCX files. */
  pages?: number;
}

export interface CVSection {
  heading: string;
  content: string;
  type: 'experience' | 'education' | 'skills' | 'summary' | 'competencies' | 'certifications' | 'other';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CV_PARSE_TIMEOUT_MS = 30_000;

// ─── CV Section Type Detection ──────────────────────────────────────────────

const SECTION_TYPE_PATTERNS: Record<CVSection['type'], RegExp[]> = {
  summary: [
    /summary/i,
    /objective/i,
    /profile/i,
    /about\s*me/i,
    /personal\s*statement/i,
    /overview/i,
  ],
  experience: [
    /experience/i,
    /employment/i,
    /work\s*history/i,
    /professional/i,
    /career/i,
    /positions?\s*held/i,
  ],
  education: [
    /education/i,
    /academic/i,
    /qualifications?/i,
    /degrees?/i,
    /university/i,
    /school/i,
  ],
  skills: [
    /skills?/i,
    /technologies/i,
    /technical/i,
    /tools/i,
    /languages/i,
    /proficienc/i,
  ],
  competencies: [
    /competenc/i,
    /core\s*skills/i,
    /key\s*strengths/i,
  ],
  certifications: [
    /certific/i,
    /accredit/i,
    /licen[cs]/i,
  ],
  other: [],
};

function detectSectionType(heading: string): CVSection['type'] {
  for (const [type, patterns] of Object.entries(SECTION_TYPE_PATTERNS) as [CVSection['type'], RegExp[]][]) {
    if (type === 'other') continue;
    for (const pattern of patterns) {
      if (pattern.test(heading)) {
        return type;
      }
    }
  }
  return 'other';
}

// ─── parseCV ────────────────────────────────────────────────────────────────

/**
 * Parses an uploaded CV/resume document (PDF or DOCX).
 * Must complete within 30 seconds.
 */
export async function parseCV(file: File): Promise<CVContent> {
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (ext !== 'pdf' && ext !== 'docx') {
    throw new Error(`Unsupported CV format ".${ext}". Accepted formats: PDF, DOCX.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CV_PARSE_TIMEOUT_MS);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parseResult: { content: { sections: Array<{ title: string; body: string }>; rawText: string }; metadata?: { pageCount?: number } };

    if (ext === 'pdf') {
      parseResult = await Promise.race([
        parsePdf(buffer, fileName),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('CV parsing timed out after 30 seconds.'));
          });
        }),
      ]);
    } else {
      parseResult = await Promise.race([
        parseDocx(buffer, fileName),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('CV parsing timed out after 30 seconds.'));
          });
        }),
      ]);
    }

    const sections: CVSection[] = parseResult.content.sections.map((section) => ({
      heading: section.title,
      content: section.body,
      type: detectSectionType(section.title),
    }));

    // Only a PDF's page count is passed on; the key is left out otherwise so other output is unchanged.
    const pages = ext === 'pdf' ? parseResult.metadata?.pageCount : undefined;
    return {
      sections,
      rawText: parseResult.content.rawText,
      ...(typeof pages === 'number' && pages > 0 ? { pages } : {}),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
