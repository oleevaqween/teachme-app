import { checkCv } from './cv-checker';
import { profileText, type Resume } from './schema';

/** Which read-quality problem was found in the imported text. */
export type ReadIssueId = 'scanned' | 'scrambled' | 'characters' | 'contact' | 'experience';
/** One read-quality problem, with the title and advice shown on the import review screen. */
export type ReadIssue = { id: ReadIssueId; title: string; advice: string };
/** Where the imported text came from; pages is the PDF page count when the parser knows it. */
export type ReadSource = { kind: 'pdf' | 'docx' | 'text'; pages?: number };
/** What the import route returns next to the imported resume (null when the check failed). */
export type ImportDiagnosis = { issues: ReadIssue[] };

/** Titles and advice for each read-quality problem (binding wording from the design). */
export const READ_ISSUES: Record<ReadIssueId, { title: string; advice: string }> = {
  scanned: { title: 'Scanned or image PDF', advice: "This PDF looks like a picture of a CV. Employers' systems may read nothing from it. Import a text-based PDF or Word file, or paste the text." },
  scrambled: { title: 'Scrambled layout', advice: 'Parts of this CV may have come out in the wrong order or split into fragments, which often happens with two-column or designed layouts. Check the fields carefully against your original.' },
  characters: { title: 'Broken characters', advice: 'Some characters did not come through correctly. Check names, dates and headings in the fields.' },
  contact: { title: 'No email or phone found', advice: "We could not find an email address or phone number in the text. If your CV keeps them in a header, footer or image, employers' systems may miss them too." },
  experience: { title: 'No experience section recognised', advice: "We could not find an experience section heading. If your CV uses an unusual heading, employers' systems may not recognise it either." },
};
/** The read problems that come from the file's layout, which a CV Studio download avoids. */
export const LAYOUT_ISSUES: readonly ReadIssueId[] = ['scanned', 'scrambled', 'characters'];

// Thresholds from the design: change them only with the design.
const MIN_LETTERS_PER_PAGE = 200;
const MIN_LINES_FOR_LAYOUT = 40;
const FRAGMENT_PERCENT = 45;
const MIN_SPACED_RUNS = 3;

const BROKEN = /�|\(cid:|\p{Co}/u;
const LEADING_SYMBOL_BULLET = /^\s*\p{Co}/u;
// One private-use character with whitespace or a line edge on both sides: an icon in a designed CV ("ada@x.com <icon> 0803...").
const STANDALONE_SYMBOL = /(?<!\S)\p{Co}(?!\S)/gu;
// Five or more single letters separated by single spaces, such as "P r o j e c t".
const SPACED_RUN = /(?<![\p{L}\p{N}])\p{L}(?: \p{L}){4,}(?![\p{L}\p{N}])/gu;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const DIGIT_GROUP = /\d+/g;
// Between two digit groups of one phone number: a single space, dot, hyphen or bracket (at most three such characters, never two spaces in a row).
const PHONE_SEPARATOR = /^(?!.* {2})[ .\-()]{1,3}$/;
const PHONE_LABEL = /\b(?:tel|phone|mobile|mob)[.:]*$/i;
const YEAR_GROUP = /^(?:19|20)\d{2}$/;
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const SEASON = '(?:spring|summer|autumn|fall|winter)';
// An academic session such as "2018/2019", "2020/21" or "2018–19".
const SESSION = '\\d{4}/\\d{2}(?:\\d{2})?|\\d{4}[-–]\\d{2}(?!\\d)';
const DATE = `(?:${SESSION}|(?:${MONTH},?\\s+|${SEASON}\\s+)?\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})`;
const DATE_RANGE = `${DATE}(?:(?:\\s*[-–—]\\s*|\\s+(?:to|until|till)\\s+)(?:${DATE}|present|current|now|today|ongoing|date|to\\s+date|till\\s+date))?`;
// A line that is only a date or a date range, such as "Jan 2020 – Present", "2018/2019", "2019 – Date" or "(2019 – 2021)"; never a layout fragment.
const DATE_ONLY_LINE = new RegExp(`^(?:${DATE_RANGE}|\\(${DATE_RANGE}\\))$`, 'i');
// Recognised CV section headings (lower case, "&" read as "and", trailing ":" removed); experience headings are matched separately.
const SECTION_HEADINGS: ReadonlySet<string> = new Set([
  'profile', 'personal profile', 'professional profile', 'career profile', 'summary', 'professional summary', 'career summary',
  'personal statement', 'objective', 'career objective',
  'education', 'educational qualifications', 'educational qualification', 'academic qualifications', 'educational background',
  'education and qualifications', 'qualifications',
  'skills', 'key skills', 'core skills', 'technical skills', 'skills and competencies', 'competencies', 'core competencies', 'key competencies',
  'certifications', 'certification', 'certificates', 'professional certifications', 'licenses and certifications', 'licences and certifications',
  'training', 'trainings', 'professional training', 'courses',
  'projects', 'key projects',
  'awards', 'achievements', 'key achievements', 'awards and achievements', 'honours and awards', 'awards and honours',
  'publications',
  'languages',
  'interests', 'hobbies', 'hobbies and interests', 'interests and hobbies',
  'referees', 'references',
  'volunteering', 'volunteer work',
  'personal details', 'personal data', 'personal information',
  'contact', 'contacts', 'contact details', 'contact information',
]);
const EMAIL_ONLY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_LABEL = /^(?:e-?mail|telephone|tel|phone|mobile|mob|cell|gsm)\b\s*[.:]?\s*/i;
const PHONE_CHARACTERS = /^[+\d\s().\-/,]+$/;
// After the heading word: "Summary", "Overview" and the like, then "and/& something" ("Experience & Achievements").
const HEADING_TAIL = '(?:\\s+(?:summary|overview|details|record|background|highlights|profile))?(?:\\s+(?:and|&)\\s+[\\p{L} ]{1,40})?';
// A word before "Experience": letters only, and never a word that makes it a sentence ("Ten years of experience").
const HEADING_WORD = '(?!(?:of|in|on|at|for|with|to|the|a|an|my|i|years?)\\b)\\p{L}+';
const EXPERIENCE_MODIFIERS = 'relevant|professional|work|working|employment|career|recent|previous|selected|industry|related|other|additional|key|volunteer|volunteering|leadership|teaching|research|management|consulting|international|military';
const EXPERIENCE_HEADING = new RegExp(
  // "Experience(s)" after up to 4 words, which may be joined by "and" or "&" ("Teaching and Research Experience", "Projects & Experience").
  `^(?:${HEADING_WORD}(?:\\s+(?:and|&))?\\s+){0,4}experiences?${HEADING_TAIL}$` +
  `|^(?:education\\s+(?:and|&)\\s+)?(?:(?:${EXPERIENCE_MODIFIERS})\\s+)*(?:employment(?:\\s+history|\\s+record)?|work\\s+history|career\\s+history|professional\\s+history|career\\s+record|positions?\\s+held)${HEADING_TAIL}$`,
  'iu',
);

const nonEmptyLines = (text: string) => text.split(/\r?\n/).filter(line => line.trim());
/** Words for the layout rule: whitespace-separated pieces that contain a letter or digit. */
const wordCount = (line: string) => line.split(/\s+/).filter(piece => /[\p{L}\p{N}]/u.test(piece)).length;

function looksScanned(text: string, pages: number | undefined): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  // Unknown page count counts as one page, so a missing count can only make the warning rarer.
  const pageCount = typeof pages === 'number' && Number.isFinite(pages) && pages >= 1 ? Math.floor(pages) : 1;
  return letters < MIN_LETTERS_PER_PAGE * pageCount;
}

/** True when the line is a recognised CV section heading, such as "Key Skills", "REFEREES:" or "Work Experience". */
function isSectionHeading(line: string): boolean {
  const heading = line.trim().replace(/[\s:]+$/, '').replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').toLowerCase();
  return SECTION_HEADINGS.has(heading) || isExperienceHeading(line);
}

/** True when the line holds only an email address or only phone numbers, with an optional label such as "Tel:". */
function isContactOnly(line: string): boolean {
  const rest = line.trim().replace(CONTACT_LABEL, '');
  return EMAIL_ONLY.test(rest) || (PHONE_CHARACTERS.test(rest) && lineHasPhone(line));
}

/**
 * A layout fragment: a line of one or two words. These count as lines but are never fragments, because every
 * normal CV has them: a date or date range, a section heading, and a line with only a phone number or email.
 */
function isFragment(line: string): boolean {
  const words = wordCount(line);
  if (words < 1 || words > 2) return false;
  const trimmed = line.trim();
  // A short label ending in a colon ("Sex:", "Marital Status:") is a form field label, not a split layout.
  if (trimmed.endsWith(':')) return false;
  return !DATE_ONLY_LINE.test(trimmed) && !isSectionHeading(trimmed) && !isContactOnly(trimmed);
}

function looksScrambled(text: string): boolean {
  const lines = nonEmptyLines(text);
  if (lines.length < MIN_LINES_FOR_LAYOUT) return false;
  const fragments = lines.filter(isFragment).length;
  // Integer comparison: at least 45% of the lines are fragments. Wide gaps between words are not a sign on their own:
  // the PDF reader never produces them, and Word keeps spaces typed to line up dates.
  return fragments * 100 >= lines.length * FRAGMENT_PERCENT;
}

function hasBrokenCharacters(text: string): boolean {
  // A private-use symbol that starts a line is a bullet from a symbol font (Word PDFs give U+F0B7), and one standing
  // alone between spaces or line edges is an icon; neither is a broken character. One touching a letter still is.
  const withoutSymbols = text.split(/\r?\n/).map(line => line.replace(LEADING_SYMBOL_BULLET, '').replace(STANDALONE_SYMBOL, '')).join('\n');
  return BROKEN.test(withoutSymbols) || (text.match(SPACED_RUN) ?? []).length >= MIN_SPACED_RUNS;
}

/**
 * True when a line holds a phone number: a run of digit groups joined by single spaces, dots, hyphens or brackets,
 * with 9 to 15 digits, that starts with "+", "0" or "(", is in 3-3-4 form, or follows "tel", "phone", "mobile" or "mob".
 * A year group (19xx, 20xx) ends a run, so "Tel 07700 900123 2015 - 2020" finds "07700 900123" and "Awards 2014 2016" finds nothing.
 */
function lineHasPhone(line: string): boolean {
  const groups = [...line.matchAll(DIGIT_GROUP)].map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  // Split the groups into chains: consecutive groups with a valid separator, none of them a year.
  const chains: typeof groups[] = [];
  let chain: typeof groups = [];
  groups.forEach((group, i) => {
    if (YEAR_GROUP.test(group.text)) { if (chain.length) chains.push(chain); chain = []; return; }
    if (chain.length && !PHONE_SEPARATOR.test(line.slice(groups[i - 1].end, group.start))) { chains.push(chain); chain = []; }
    chain.push(group);
  });
  if (chain.length) chains.push(chain);
  // Check every sub-run of every chain, not only the whole chain.
  return chains.some(run => run.some((first, i) => {
    const before = line.slice(0, first.start);
    const opens = first.text.startsWith('0') || /[+(]\s*$/.test(before);
    const labelled = PHONE_LABEL.test(before.replace(/[+(\s]+$/, ''));
    let digits = 0;
    for (let j = i; j < run.length; j++) {
      digits += run[j].text.length;
      if (digits > 15) break;
      const us = j - i === 2 && [run[i], run[i + 1], run[j]].map(g => g.text.length).join() === '3,3,4';
      if (digits >= 9 && (opens || labelled || us)) return true;
    }
    return false;
  }));
}

function hasContact(text: string): boolean {
  return EMAIL.test(text) || text.split(/\r?\n/).some(lineHasPhone);
}

/** True when one heading piece reads as an experience heading, at most 60 characters once cleaned. */
function isExperienceHeading(piece: string): boolean {
  // Drop numbering, bullets and punctuation around a heading such as "01. EXPERIENCE:" or "Experience (selected)".
  const heading = piece.replace(/\([^)]*\)?/g, ' ').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').replace(/\s+/g, ' ');
  return heading.length > 0 && heading.length <= 60 && EXPERIENCE_HEADING.test(heading);
}

function hasExperienceHeading(text: string): boolean {
  // Pieces of a line: split on tabs, runs of spaces, " | " and "/" ("Work Experience/Internships").
  return nonEmptyLines(text).some(line => line.split(/\t| {2,}| \| |\//).some(isExperienceHeading));
}

/**
 * Fixed checks of how cleanly the CV text was read, in display order. No AI is involved.
 * The scanned-PDF check runs only for PDFs; pasted text and Word files get the other four.
 */
export function readQuality(text: string, source: ReadSource): ReadIssue[] {
  const found: ReadIssueId[] = [];
  if (source.kind === 'pdf' && looksScanned(text, source.pages)) found.push('scanned');
  if (looksScrambled(text)) found.push('scrambled');
  if (hasBrokenCharacters(text)) found.push('characters');
  if (!hasContact(text)) found.push('contact');
  if (!hasExperienceHeading(text)) found.push('experience');
  return found.map(id => ({ id, ...READ_ISSUES[id] }));
}

/** Common words that never make a line count as missing; words under 3 letters are ignored anyway. */
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'nor', 'but', 'yet', 'with', 'from', 'into', 'onto', 'over', 'under', 'upon', 'about', 'above', 'below',
  'across', 'after', 'before', 'during', 'while', 'within', 'without', 'through', 'throughout', 'between', 'among', 'against',
  'toward', 'towards', 'via', 'per', 'that', 'this', 'these', 'those', 'than', 'then', 'there', 'here', 'where', 'when',
  'what', 'which', 'who', 'whom', 'whose', 'why', 'how', 'our', 'ours', 'your', 'yours', 'their', 'theirs', 'his', 'her',
  'hers', 'its', 'mine', 'they', 'them', 'she', 'him', 'you', 'myself', 'yourself', 'itself', 'ourselves', 'themselves',
  'are', 'was', 'were', 'been', 'being', 'has', 'have', 'had', 'having', 'does', 'did', 'doing', 'will', 'would', 'shall',
  'should', 'can', 'could', 'may', 'might', 'must', 'not', 'also', 'all', 'any', 'each', 'every', 'both', 'either', 'neither',
  'some', 'such', 'other', 'another', 'more', 'most', 'many', 'much', 'few', 'own', 'same', 'very', 'just', 'only', 'too',
  'out', 'off', 'etc', 'including',
]);
/** At most this many possibly missing lines are listed; the rest are counted. */
export const MISSING_LIMIT = 10;

const lettersWords = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/**
 * Original lines that may not have reached any field: a line with at least 3 meaningful words
 * (3 or more letters, not filler) of which fewer than half appear anywhere in the fields.
 * Whole words, case-insensitive; repeated lines are listed once, in original order.
 */
export function missingLines(sourceText: string, resume: Resume): { lines: string[]; more: number } {
  const known = new Set(lettersWords(profileText(resume)));
  const listed = new Set<string>();
  const missing: string[] = [];
  for (const raw of sourceText.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, ' ');
    const key = line.toLowerCase();
    if (!line || listed.has(key)) continue;
    const meaningful = [...new Set(lettersWords(line).filter(word => word.length >= 3 && !FILLER_WORDS.has(word)))];
    if (meaningful.length < 3) continue;
    const present = meaningful.filter(word => known.has(word)).length;
    if (present * 2 < meaningful.length) { listed.add(key); missing.push(line); }
  }
  return { lines: missing.slice(0, MISSING_LIMIT), more: Math.max(0, missing.length - MISSING_LIMIT) };
}

/** The CV checker's score and up to 3 "fix" titles, most points lost first (spelling not run, no market). */
export function firstCheck(resume: Resume, now: Date): { score: number; fixes: string[] } {
  const check = checkCv(resume, now);
  const fixes = check.findings.filter(f => f.level === 'fix').sort((a, b) => b.pointsLost - a.pointsLost).slice(0, 3).map(f => f.title);
  return { score: check.score, fixes };
}
