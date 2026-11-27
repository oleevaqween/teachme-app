import { readFile } from 'node:fs/promises';
import path from 'node:path';
import nspell from 'nspell';
import type { SpellingResult, SpellingWord } from './cv-checker';
import { cvTextFields, type CvField } from './cv-text';
import type { Resume } from './schema';

export type Variant = 'en-GB' | 'en-US';
export type WordChecker = { correct(word: string): boolean; suggest(word: string): string[] };

const PACKAGES: Record<Variant, string> = { 'en-GB': 'dictionary-en-gb', 'en-US': 'dictionary-en' };
const MAX_WORDS = 50;
const MAX_SUGGESTED = 30;
const loaded = new Map<Variant, Promise<WordChecker>>();

/** Work words the dictionaries do not know. Acronyms and capitalised names are skipped anyway. */
export const CV_TERMS = new Set(['rollout', 'rollouts', 'onboard', 'onboarding', 'onboarded', 'offboarding', 'workstream', 'workstreams', 'roadmap',
  'roadmaps', 'upskill', 'upskilled', 'upskilling', 'reskilling', 'backend', 'frontend', 'fullstack', 'fintech', 'edtech', 'healthtech', 'omnichannel',
  'runbook', 'runbooks', 'standup', 'standups', 'learnings', 'wellbeing', 'cybersecurity', 'ecommerce', 'scalable', 'scalability', 'benchmarking',
  'signoff', 'upsell', 'upselling', 'kanban', 'scrum', 'microservices', 'devops', 'saas', 'crm', 'erp', 'api', 'apis', 'ui', 'ux', 'okr', 'okrs',
  'kpi', 'kpis', 'pmo', 'pmp', 'sharepoint', 'jira', 'linkedin',
  // Checked against both dictionaries: each of these is rejected by en-GB and en-US.
  'telecoms', 'telco', 'telcos', 'burndown', 'cutover', 'cutovers', 'infosec', 'golive', 'hypercare', 'timebox', 'timeboxed', 'workshopping',
  'dashboarding', 'nearshoring', 'insourcing', 'ringfenced', 'ringfence', 'rebaselined', 'rebaseline', 'baselined',
  'hackathon', 'hackathons', 'naira', 'kobo', 'cedi', 'cedis', 'fintechs', 'scaleup', 'scaleups', 'agritech', 'proptech', 'insurtech', 'regtech', 'govtech']);

const VARIANT_SWAPS: [RegExp, string][] = [
  [/ize(s|d|r|rs)?$/, 'ise$1'], [/ise(s|d|r|rs)?$/, 'ize$1'], [/izing$/, 'ising'], [/ising$/, 'izing'],
  [/ization(s)?$/, 'isation$1'], [/isation(s)?$/, 'ization$1'],
  [/yze(s|d)?$/, 'yse$1'], [/yse(s|d)?$/, 'yze$1'], [/yzing$/, 'ysing'], [/ysing$/, 'yzing'],
  [/our(s|ed|ing|ite|ites|able)?$/, 'or$1'], [/or(s|ed|ing|ite|ites|able)?$/, 'our$1'],
  [/tre(s)?$/, 'ter$1'], [/ter(s)?$/, 'tre$1'], [/ogue(s)?$/, 'og$1'], [/og(s)?$/, 'ogue$1'],
  [/mme(s)?$/, 'm$1'],
  [/elled$/, 'eled'], [/eled$/, 'elled'], [/elling$/, 'eling'], [/eling$/, 'elling'],
];

/** The dictionary for one variant, read from node_modules once per server process. */
export function loadSpeller(variant: Variant): Promise<WordChecker> {
  let speller = loaded.get(variant);
  if (!speller) {
    const dir = path.join(process.cwd(), 'node_modules', PACKAGES[variant]);
    speller = Promise.all([readFile(path.join(dir, 'index.aff')), readFile(path.join(dir, 'index.dic'))]).then(([aff, dic]) => nspell(aff, dic));
    // A failed read is retried on the next request instead of being cached.
    speller.catch(() => loaded.delete(variant));
    loaded.set(variant, speller);
  }
  return speller;
}

/** The chosen variant's spelling of a word written in the other variant ("color" to "colour"). */
export function variantFix(word: string, speller: WordChecker): string {
  for (const [pattern, replacement] of VARIANT_SWAPS) {
    if (!pattern.test(word)) continue;
    const candidate = word.replace(pattern, replacement);
    if (candidate !== word && speller.correct(candidate)) return candidate;
  }
  // Fallback: only a close suggestion that is not just the word with an ending added.
  const lower = word.toLowerCase();
  const first = speller.suggest(word)[0] ?? '';
  const near = Math.abs(first.length - word.length) <= 2 && ![lower + 'd', lower + 'ed', lower + 's'].includes(first.toLowerCase());
  return first && near ? first : '';
}

/** The words of one field worth checking, with whether each starts a sentence or line. */
function fieldWords(field: CvField): { word: string; sentenceStart: boolean }[] {
  const out: { word: string; sentenceStart: boolean }[] = [];
  for (const line of field.text.split('\n')) {
    const tokens = line.replace(/^\s*[•*–-]\s*/, '').split(/[\s–—]+/).filter(Boolean);
    let start = true;
    for (const raw of tokens) {
      const token = raw.replace(/[’‘]/g, "'");
      const word = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      // Links, emails, handles and anything with a digit are never spell-checked.
      const skip = /[\d@/\\#+&_=]|www\./i.test(token) || !/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(word) || word.length < 2;
      if (!skip) out.push({ word, sentenceStart: start });
      start = /[.!?:]['")\]]*$/.test(token);
    }
  }
  return out;
}

function isKnown(word: string, sentenceStart: boolean, titleCase: boolean, speller: WordChecker, own: Set<string>): boolean {
  const lower = word.toLowerCase();
  if (CV_TERMS.has(lower) || own.has(lower)) return true;
  const base = word.replace(/'s$/i, '');
  if (/^[A-Z]+s?$/.test(word) || /^[A-Z]+s?$/.test(base)) return true; // an acronym such as PMO, KPIs or PMO's
  // A brand or degree such as SharePoint, BSc or MEng; a capital after a hyphen ("Cross-Funtional") is a title-cased word, checked by parts below.
  if (/[^-]\p{Lu}/u.test(base)) return true;
  if (/^[A-Z]/.test(word) && !sentenceStart && !titleCase) return true; // a name or a place
  if ([word, lower, base, base.toLowerCase()].some(form => speller.correct(form))) return true;
  if (word.includes('-')) {
    const joined = lower.replace(/-/g, '');
    if (speller.correct(joined)) return true;
    // Each part as written and in lower case, so a proper-noun part ("Anglo-Nigerian") is still found.
    return word.split('-').every(part => part.length < 3 || CV_TERMS.has(part.toLowerCase()) || own.has(part.toLowerCase())
      || speller.correct(part) || speller.correct(part.toLowerCase()));
  }
  return false;
}

/** Misspelt words and other-variant words, each reported once at its first appearance. */
export function spellCheck(fields: CvField[], speller: WordChecker, other: WordChecker, ownWords: string[]): Pick<SpellingResult, 'words' | 'variantWords'> {
  const own = new Set(ownWords.map(w => w.trim().toLowerCase()).filter(Boolean));
  const reported = new Set<string>();
  const words: SpellingWord[] = [];
  const variantWords: SpellingWord[] = [];
  for (const field of fields) {
    for (const { word, sentenceStart } of fieldWords(field)) {
      const key = word.toLowerCase();
      if (reported.has(key) || isKnown(word, sentenceStart, !!field.titleCase, speller, own)) continue;
      reported.add(key);
      const where = { target: field.target, where: field.label };
      const hyphenParts = key.includes('-') ? key.split('-') : [];
      const hyphenVariant = hyphenParts.length > 0 && hyphenParts.every(p => p.length < 3 || CV_TERMS.has(p) || own.has(p) || other.correct(p));
      if (other.correct(word) || other.correct(key) || hyphenVariant) {
        if (variantWords.length >= MAX_WORDS) continue;
        let fix: string;
        if (hyphenVariant) {
          const mapped = hyphenParts.map(p => (p.length < 3 || CV_TERMS.has(p) || own.has(p) || speller.correct(p) ? p : variantFix(p, speller)));
          fix = mapped.every(Boolean) ? mapped.join('-') : '';
        } else fix = variantFix(key, speller);
        const shown = /^[A-Z]/.test(word) && fix ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
        variantWords.push({ word, suggestions: shown ? [shown] : [], ...where });
      } else if (words.length < MAX_WORDS) {
        let suggestions: string[] = [];
        if (words.length < MAX_SUGGESTED) {
          suggestions = speller.suggest(word).slice(0, 3);
          if (!suggestions.length && hyphenParts.length) {
            // A hyphenated typo: fix each misspelt part and keep the correct ones.
            const mapped = hyphenParts.map(p => (p.length < 3 || CV_TERMS.has(p) || own.has(p) || speller.correct(p) ? p : speller.suggest(p)[0] ?? ''));
            if (mapped.every(Boolean)) suggestions = [mapped.join('-')];
          }
        }
        words.push({ word, suggestions, ...where });
      }
    }
  }
  return { words, variantWords };
}

/** Spell-checks a CV's prose against the chosen dictionary, using the other one to recognise variant spellings. */
export async function checkCvSpelling(resume: Resume, variant: Variant, ownWords: string[]): Promise<SpellingResult> {
  const [speller, other] = await Promise.all([loadSpeller(variant), loadSpeller(variant === 'en-GB' ? 'en-US' : 'en-GB')]);
  return { variant, ...spellCheck(cvTextFields(resume), speller, other, ownWords) };
}
