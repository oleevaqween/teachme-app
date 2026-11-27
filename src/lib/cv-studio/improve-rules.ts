import { applySuggestion, newNumbers, targetText, type Resume, type Suggestion } from './schema';
import { WEAK_OPENINGS } from './cv-checker';
import type { ImproveAnswer } from './improve-schema';
// Shared with tailoring; Improve my CV keeps importing it from here.
export { ownershipFlags } from './edit-safety';

export type ImproveItem = { target: string; field: string; label: string; kind: 'bullets' | 'summary' | 'headline' | 'skills'; reason: string };

const lines = (text: string) => text.split('\n').map(l => l.replace(/^[•*-]\s*/, '').trim()).filter(Boolean);
const roleLabel = (title: string, organisation: string, fallback: string) => [title.trim(), organisation.trim()].filter(Boolean).join(' · ') || fallback;

/** A one-line reason a bullet section is weak, from simple counts (not an AI judgement). */
function bulletReason(text: string): string {
  const all = lines(text);
  if (!all.length) return 'No achievements yet: answer a few questions to add some.';
  const noFigure = all.filter(l => !/\d/.test(l)).length;
  const weak = all.filter(l => WEAK_OPENINGS.some(phrase => l.toLowerCase().startsWith(phrase))).length;
  const parts = [`${noFigure} of ${all.length} bullets have no number or result`];
  if (weak) parts.push(`${weak} start${weak === 1 ? 's' : ''} with a weak opening`);
  return noFigure || weak ? parts.join('; ') : 'Looks solid; you can still sharpen it.';
}

export function improveItems(resume: Resume): ImproveItem[] {
  const items: ImproveItem[] = [];
  for (const e of resume.experience) items.push({ target: 'experience.' + e.id, field: `experience.${e.id}.achievements`, label: roleLabel(e.title, e.company, 'Experience'), kind: 'bullets', reason: bulletReason(e.achievements) });
  for (const v of resume.volunteering) items.push({ target: 'volunteering.' + v.id, field: `volunteering.${v.id}.achievements`, label: roleLabel(v.role, v.organisation, 'Volunteering'), kind: 'bullets', reason: bulletReason(v.achievements) });
  if (resume.projects.trim()) items.push({ target: 'projects', field: 'projects', label: 'Projects', kind: 'bullets', reason: bulletReason(resume.projects) });
  const summaryWords = resume.summary.trim().split(/\s+/).filter(Boolean).length;
  items.push({ target: 'summary', field: 'summary', label: 'Summary', kind: 'summary', reason: summaryWords ? `${summaryWords} words; a strong summary is 30 to 90.` : 'No summary yet.' });
  items.push({ target: 'headline', field: 'personal.professionalTitle', label: 'Headline', kind: 'headline', reason: resume.personal.professionalTitle.trim() ? 'Check it says clearly what you do.' : 'No headline yet.' });
  items.push({ target: 'skills', field: 'skills', label: 'Skills', kind: 'skills', reason: 'Group and order the skills you listed; nothing is added.' });
  return items;
}

/** Offered when the AI cannot be reached: the same four questions an expert CV writer asks about any role. */
export function fallbackQuestions(): { bullet: string; question: string; why: string }[] {
  return [
    { bullet: '', question: 'What did you personally do in this role that you are proudest of?', why: 'Names your own action.' },
    { bullet: '', question: 'What changed because of it (time saved, money, quality, people helped)?', why: 'Gives the result.' },
    { bullet: '', question: 'How do you know it worked (a report, feedback, a measure)?', why: 'Makes the claim checkable.' },
    { bullet: '', question: 'How big was it: people, money, time or volume? An estimate is fine; mark it Approximate.', why: 'Shows the scale.' },
  ];
}

const VALUES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const UNIT = 'one|two|three|four|five|six|seven|eight|nine';
const TEEN = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const BELOW = `(?:(?:${TENS})(?:[- ](?:${UNIT}))?|${TEEN}|${UNIT})`;
const HEAD = `(?:${BELOW}(?:\\s+hundred(?:\\s+(?:and\\s+)?${BELOW})?)?|(?:a|one)\\s+hundred(?:\\s+(?:and\\s+)?${BELOW})?)`;
const PHRASE = new RegExp(`\\b(?:${HEAD}(?:\\s+(?:thousand|million))?|(?:a|one)\\s+(?:thousand|million))\\b`, 'gi');

/** The value of a whole number phrase such as "two hundred and fifty" (250). */
function phraseValue(phrase: string): number {
  let total = 0, current = 0;
  for (const token of phrase.toLowerCase().split(/[-\s]+/)) {
    if (token in VALUES) current += VALUES[token];
    else if (token === 'hundred') current = (current || 1) * 100;
    else if (token === 'thousand' || token === 'million') { total += (current || 1) * (token === 'thousand' ? 1000 : 1000000); current = 0; }
  }
  return total + current;
}
/** "one" as a pronoun or in "one-to-one" is not a number. */
function notANumber(text: string, start: number, phrase: string): boolean {
  if (phrase.toLowerCase() !== 'one') return false;
  const before = text.slice(0, start), after = text.slice(start + phrase.length);
  return /^(?:\s+(?:of|another|or more)\b|-to-)/i.test(after) || /-to-$/i.test(before) || /\b(?:no|every|any|each)\s+$/i.test(before);
}

const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000 };
/** A digit figure followed by a scale word ("₦2 million", "1.5 million", "300 thousand"). */
const DIGIT_SCALE = /(\d[\d,]*(?:\.\d+)?)\s*(hundred|thousand|million|billion)\b/gi;
/** The full value, or null when a comma could be a decimal comma ("1,5 million"), so it is never read as 15. */
function scaled(figure: string, scale: string): string | null {
  if (figure.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(figure)) return null;
  return String(Math.round(parseFloat(figure.replaceAll(',', '')) * SCALES[scale.toLowerCase()]));
}

/** Numbers the user wrote as words, as digits: only the combined value of a phrase ("twenty-five" gives 25 alone). */
export function writtenNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(DIGIT_SCALE)) { const value = scaled(m[1], m[2]); if (value) found.add(value); }
  for (const m of text.matchAll(PHRASE)) if (!notANumber(text, m.index!, m[0])) found.add(String(phraseValue(m[0])));
  return [...found];
}

/** The text with number phrases written as words replaced by digits. */
export function wordsToDigits(input: string): string {
  const text = input.replace(DIGIT_SCALE, (all: string, figure: string, scale: string) => scaled(figure, scale) ?? all);
  return text.replace(PHRASE, (phrase, offset: number) => (notANumber(text, offset, phrase) ? phrase : String(phraseValue(phrase))));
}

/** Numbers in `after` not found in `source`, where numbers written as words count as digits on both sides. */
export function unsupportedNumbers(source: string, after: string): string[] {
  return newNumbers(source + '\n' + writtenNumbers(source).join(' '), wordsToDigits(after));
}

const canonical = (n: string) => n.replace(/(\d),(?=\d{3}\b)/g, '$1');
/** The numbers in answers the user marked Approximate (digits or words, thousands commas removed). */
export function approximateNumbers(answers: ImproveAnswer[]): string[] {
  const out = new Set<string>();
  for (const a of answers.filter(x => x.status === 'answered' && x.number === 'approximate')) {
    for (const n of canonical(a.answer).match(/\d+(?:\.\d+)?/g) ?? []) out.add(n);
    for (const n of writtenNumbers(a.answer)) out.add(n);
  }
  return [...out];
}

const QUALIFIER = /\b(?:about|around|roughly|approximately|nearly|almost|up to|at least|over|more than|some)\s*[^\w\s]{0,2}\s*$/i;
/** Approximate numbers that appear in `after` (words turned to digits) without a qualifier, a plus sign or a range. */
export function missingApproximations(after: string, approximate: string[]): string[] {
  const text = canonical(wordsToDigits(after));
  return approximate.filter(n => {
    const pattern = new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?!\\d)(?!\\.\\d)`, 'g');
    return [...text.matchAll(pattern)].some(m => {
      const before = text.slice(0, m.index), rest = text.slice(m.index! + n.length);
      if (rest.startsWith('+')) return false;
      // "from 5 to 20" is a change from one figure to another, not a range of estimates.
      const fromEnd = /\bfrom\s*[^\w\s]{0,2}\s*\d[\d.]*\s*to\s*[^\w\s]{0,2}\s*$/i.test(before);
      const fromStart = /\bfrom\s*[^\w\s]{0,2}\s*$/i.test(before);
      const ranged = (!fromEnd && /\d\s*(?:-|to)\s*[^\w\s]?$/.test(before)) || (!fromStart && /^\s*(?:-|to)\s*[^\w\s]?\d/.test(rest));
      return !ranged && !QUALIFIER.test(before);
    });
  });
}

/** The skills in a skills field, ignoring group labels such as "Delivery:"; lower case, sorted, unique. */
export function skillItems(text: string): string[] {
  const items = text.split('\n').flatMap(line => line.replace(/^\s*[^,:\n]{1,40}:\s*/, '').split(/[,;|•]/));
  return [...new Set(items.map(s => s.trim().toLowerCase().replace(/^(?:and|or)\s+/, '')).filter(Boolean))].sort();
}
const GENERIC_LABELS = new Set(['tools', 'technical', 'software', 'methods', 'methodologies', 'platforms', 'languages', 'systems', 'core', 'other', 'soft', 'skills', 'and', 'of', 'the', '&']);
const wordsOf = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
/** True only when the same skills remain and grouping added or removed no word beyond a generic label. */
export function sameSkills(a: string, b: string): boolean {
  if (JSON.stringify(skillItems(a)) !== JSON.stringify(skillItems(b))) return false;
  const inA = new Set(wordsOf(a)), inB = new Set(wordsOf(b));
  return wordsOf(b).every(w => inA.has(w) || GENERIC_LABELS.has(w)) && wordsOf(a).every(w => inB.has(w) || GENERIC_LABELS.has(w));
}

const HEADLINE_JOINERS = new Set(['and', 'of', 'the', 'in', 'for', 'with', 'to', 'a', 'an', '&']);
/** Headline words that appear nowhere in the CV's titles, summary, skills or education. */
export function headlineNewWords(resume: Resume, after: string): string[] {
  const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) ?? [];
  const allowed = new Set(words([resume.personal.professionalTitle, resume.summary, resume.skills, ...resume.experience.map(e => e.title),
    ...resume.volunteering.map(v => v.role), ...resume.education.map(e => e.degree), resume.certifications].join(' ')));
  return [...new Set(words(after).filter(w => !allowed.has(w) && !HEADLINE_JOINERS.has(w)))];
}

export const STALE_IMPROVE = 'This part of your CV changed since the suggestion was made. Ask for fresh suggestions before accepting it.';

export function replaceLine(text: string, index: number, before: string, after: string): string {
  const all = text.split('\n');
  if (!Number.isInteger(index) || index < 0 || index >= all.length || typeof before !== 'string' || all[index] !== before) throw new Error(STALE_IMPROVE);
  all[index] = after;
  return all.join('\n');
}

const IMPROVE_FIELD = /^(?:(?:experience|volunteering)\.[a-zA-Z0-9_-]+\.achievements|projects|summary|skills|personal\.professionalTitle)$/;
export type ImproveChange = { field: string; line: number | null; before: string; after: string };
/** Applies one accepted change, refusing it if the line or field no longer reads as it did. */
export function applyImprove(resume: Resume, change: ImproveChange): Resume {
  if (!IMPROVE_FIELD.test(change.field)) throw new Error(STALE_IMPROVE);
  const current = targetText(resume, change.field);
  if (current === undefined) throw new Error(STALE_IMPROVE);
  if (change.line !== null && /[\r\n]/.test(change.after)) throw new Error('A suggestion for one line must stay on one line.');
  const next = change.line === null
    ? (current === change.before ? change.after : (() => { throw new Error(STALE_IMPROVE); })())
    : replaceLine(current, change.line, change.before, change.after);
  const suggestion: Suggestion = { id: 'improve', target: change.field, before: current, after: next, reason: '', evidence: [{ source: 'improve', quote: '' }], status: 'accepted' };
  return applySuggestion(resume, suggestion);
}

/** A readable, collision-safe id: a slug prefix plus a hash of the full target and question (FNV-1a 32-bit, base36). */
export function improveAnswerId(target: string, question: string): string {
  const full = target + '\n' + question;
  let hash = 0x811c9dc5;
  for (let i = 0; i < full.length; i++) hash = Math.imul(hash ^ full.charCodeAt(i), 0x01000193) >>> 0;
  const slug = (target + '-' + question).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
  return [slug, hash.toString(36)].filter(Boolean).join('-');
}

export const IMPROVE_ANSWER_LIMIT = 150;

/** Adds or replaces one answer. A new empty draft is not stored, but an existing answer cleared to empty stays (so its card remains while retyped); a new answer past the limit is refused so saving never breaks. */
export function upsertImproveAnswer(answers: ImproveAnswer[], answer: ImproveAnswer): { answers: ImproveAnswer[]; error?: string } {
  const exists = answers.some(a => a.id === answer.id);
  if (!exists && answer.status === 'draft' && answer.number === 'none' && !answer.answer.trim()) return { answers };
  if (exists) return { answers: answers.map(a => (a.id === answer.id ? answer : a)) };
  if (answers.length >= IMPROVE_ANSWER_LIMIT) return { answers, error: `You have reached the limit of ${IMPROVE_ANSWER_LIMIT} saved answers for this CV. Clear old answers to add more.` };
  return { answers: [...answers, answer] };
}
