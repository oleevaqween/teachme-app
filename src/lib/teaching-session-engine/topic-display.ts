// src/lib/teaching-session-engine/topic-display.ts
//
// Client-safe: tidies a stage's topic list for display. Topics are raw headings
// taken from the user's documents (often in capitals, with section numbers,
// placeholders such as "Section 94" and page furniture). Nothing here changes
// what is stored; stage completion still reads the original list.

/** One topic as shown: an optional section number and a readable name. */
export interface DisplayTopic {
  number?: string;
  name: string;
}

/** Abbreviations kept in capitals when a heading is converted from capitals. */
const ABBREVIATIONS = new Set([
  'PMBOK', 'PMI', 'PMP', 'PMO', 'PMIS', 'WBS', 'RACI', 'SWOT', 'FMEA', 'PERT', 'EVM', 'KPI', 'KPIS',
  'OKR', 'OKRS', 'ACP', 'RMP', 'MBA', 'CEO', 'CFO', 'CTO', 'IT', 'AI', 'HR', 'QA', 'UK', 'US', 'USA',
  'EEF', 'EEFS', 'OPA', 'OPAS', 'RFP', 'ROI', 'CPM', 'OBS', 'RBS', 'CCB', 'SOW', 'MVP', 'ISO', 'SLA',
]);

/** Joining words written in lower case unless they start the name. */
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'vs', 'with',
]);

/** Joining words that, at the very end, show the heading was cut off by a line break. */
const TRAILING_JOINERS = new Set(['a', 'an', 'and', 'for', 'of', 'or', 'the', 'to', 'with', 'in', 'on']);

/** Headings that are part of a book's furniture, not something being taught. */
const FURNITURE = new Set([
  'table of contents', 'contents', 'preface', 'notice', 'index', 'foreword', 'acknowledgments', 'acknowledgements',
]);

const BROKEN_CHARACTER = '�';

function titleCaseSegment(segment: string, isFirstWord: boolean): string {
  const match = segment.match(/^([^A-Za-z0-9]*)([A-Za-z0-9]+)(.*)$/);
  if (!match) return segment;
  const [, before, core, after] = match;
  const upper = core.toUpperCase();
  let word: string;
  if (ABBREVIATIONS.has(upper) || /\d/.test(core)) word = upper;
  else if (!isFirstWord && SMALL_WORDS.has(core.toLowerCase())) word = core.toLowerCase();
  else if (core.length === 1) word = upper;
  else word = upper.charAt(0) + core.slice(1).toLowerCase();
  return `${before}${word}${after}`;
}

function titleCaseWord(token: string, isFirstWord: boolean): string {
  // A whole word in brackets, such as "(PMIS)", is an abbreviation: keep it.
  if (/^\([^()]+\)[.,;:]?$/.test(token)) return token;
  // Each part of "HIGH-PERFORMING" or "CUSTOMER/BUSINESS" is cased on its own; only the
  // first part of the first word may stay a capital small word ("A").
  return token
    .split(/([-/])/)
    .map((part, index) => (part === '-' || part === '/' ? part : titleCaseSegment(part, isFirstWord && index === 0)))
    .join('');
}

/** A readable version of one heading. Names already in mixed case keep their case. */
export function tidyTopicName(raw: string): string {
  let name = raw
    .replace(new RegExp(`PMBOK${BROKEN_CHARACTER}`, 'g'), 'PMBOK®')
    .replaceAll(BROKEN_CHARACTER, '')
    .replace(/\s+/g, ' ')
    .trim();

  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) {
    name = name
      .split(' ')
      .map((token, index) => titleCaseWord(token, index === 0))
      .join(' ');
  }

  const words = name.split(' ');
  const last = words[words.length - 1]?.toLowerCase();
  if (words.length > 1 && last && TRAILING_JOINERS.has(last)) name = `${name}…`;
  return name;
}

function isPlaceholderOrFurniture(name: string): boolean {
  const plain = name.trim();
  if (/^section\s+\d+$/i.test(plain)) return true;
  if (FURNITURE.has(plain.toLowerCase())) return true;
  // Author credentials such as "PMI-RMP, PMP".
  if (plain.includes(',') && plain.split(',').every((part) => /^[A-Z]{2,5}(-[A-Z]{2,5})?$/.test(part.trim()))) return true;
  // Letters scattered across a line, such as "I A R C C".
  if (plain.split(/\s+/).filter((token) => /^[A-Za-z]$/.test(token)).length >= 3) return true;
  return false;
}

/**
 * The topic list as shown in the lesson header: section numbers split off,
 * capitals made readable, placeholders, page furniture and repeats removed.
 */
export function displayTopics(topics: readonly string[]): DisplayTopic[] {
  const seen = new Set<string>();
  const result: DisplayTopic[] = [];

  for (const raw of topics) {
    // Broken characters are repaired or dropped later by tidyTopicName.
    let text = raw.replace(/\s+/g, ' ').trim();

    // A Roman numeral or a bare page number printed in front of a heading.
    text = text.replace(/^(?:I|II|III|IV|V|VI|VII|VIII|IX)\s+(?=[A-Z]{2})/, '');
    text = text.replace(/^\d{2,}\s+(?=[A-Z])/, '');

    let number: string | undefined;
    const numbered = text.match(/^(X?\d+(?:\.\d+)+|X\d+)\s+(.+)$/);
    if (numbered && /^[A-Z(]/.test(numbered[2])) {
      number = numbered[1];
      text = numbered[2];
    }

    if (!/[A-Za-z]/.test(text) || isPlaceholderOrFurniture(text)) continue;

    const name = tidyTopicName(text);
    if (!name) continue;
    const key = `${number ?? ''}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(number ? { number, name } : { name });
  }

  return result;
}
