import type { CheckFinding, CheckTarget } from './cv-checker';
import { bulletsOf } from './cv-text';
import type { Resume } from './schema';

const YEAR = '(?:19[5-9]\\d|20\\d\\d)';
const MONTH = '\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
// Words and marks that show the number after them is a year: "in 2021", "Jan 2020", "(2019)".
// "of", "to", "by" and "and" are not here: after them a number is a figure ("a team of 2000 people"), unless nothing
// or punctuation follows it ("in the spring of 2021."), which the check below already reads as a year.
const YEAR_LEAD = new RegExp(`(?:\\b(?:in|since|from|until|till|through|during|between|before|after|early|mid|late|circa)|${MONTH}|[(–—/-])\\s*$`, 'i');
// A span of years: "2019-2021", "2019 to 2021", "between 2019 and 2021", "2019 until now".
const YEAR_RANGE = new RegExp(`\\b${YEAR}\\s*(?:[–—-]|\\b(?:to|until|till|through|and)\\b)\\s*(?:${YEAR}|present|now|today)\\b`, 'gi');
// A fiscal year, half or quarter with an optional year ("Q4", "Q4 2021", "Q4 '21", "FY23"); a count after it ("Q4 250 deals") stays.
const PERIOD = new RegExp(`\\b(?:FY|H[12]|Q[1-4])(?:\\s?'\\d{2}|\\s?${YEAR}|\\d{2})?\\b`, 'gi');

/** True when a line has a real figure. Years, dates, year ranges, fiscal years and quarters do not count. */
export function hasFigure(text: string): boolean {
  let rest = text
    .replace(/\b\d{1,2}[/-](?:19|20)\d\d\b/g, ' ')
    .replace(PERIOD, ' ')
    .replace(YEAR_RANGE, ' ');
  rest = rest.replace(new RegExp(`\\b${YEAR}\\b`, 'g'), (year: string, offset: number, whole: string) => {
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + year.length);
    const isYear = YEAR_LEAD.test(before) || /^\s*(?:[)–—,.;:]|$)/.test(after) || (!before.trim() && !/^\s*[a-z]/i.test(after));
    return isYear ? ' ' : year;
  });
  return /\d/.test(rest);
}

const PARTICIPLE = '(?:[a-z]+ed|[a-z]+en|built|made|done|run|led|held|kept|set|sent|won|taught|bought|brought|sold|told|paid|met|spent|lost|found)';
const PASSIVE = new RegExp(`\\b(?:was|were|is|are|been|being|be)\\s+(?:[a-z]+ly\\s+)?${PARTICIPLE}\\s+by\\b`, 'i');
// "Was promoted to Senior Analyst" reports a step up, not work done passively.
const PROMOTED_TO = '(?:promoted|appointed|elected|selected|nominated|invited|shortlisted)\\s+to\\b';
const PASSIVE_START = new RegExp(`^(?:was|were)\\s+(?:[a-z]+ly\\s+)?(?!${PROMOTED_TO})${PARTICIPLE}\\b`, 'i');
const FILLER = [/\bvarious\b/i, /\betc\b\.?/i, /\ba number of\b/i, /\bin order to\b/i, /\butili[sz](?:e|ed|es|ing)\b/i];
// Weak openings are the Impact check's job; in a bullet these only count after its first word.
const FILLER_INSIDE = [/\bresponsible for\b/i, /\bin charge of\b/i, /\bduties included\b/i, /\btasked with\b/i, /\binvolved in\b/i];
const COMMON = new Set(['with', 'from', 'that', 'this', 'these', 'those', 'their', 'there', 'into', 'over', 'also', 'have', 'were', 'which', 'while',
  'across', 'within', 'through', 'including', 'team', 'teams', 'each', 'both', 'more', 'than', 'other', 'such', 'them', 'they', 'will', 'been',
  'being', 'where', 'when', 'what', 'your', 'about', 'after', 'before', 'under', 'between', 'every', 'year', 'years', 'month', 'months', 'week', 'weeks']);
const PRESENT = ['manage', 'deliver', 'build', 'create', 'develop', 'launch', 'improve', 'increase', 'reduce', 'coordinate', 'implement', 'analyse',
  'analyze', 'train', 'mentor', 'resolve', 'oversee', 'negotiate', 'organise', 'organize', 'supervise', 'maintain', 'monitor', 'prepare', 'ensure',
  'provide', 'handle', 'conduct', 'collaborate', 'communicate', 'facilitate', 'drive', 'write', 'run', 'coach'];
const PRESENT_FORMS = new Set(PRESENT.flatMap(v => [v, /(?:s|sh|ch|x|z|o)$/.test(v) ? v + 'es' : v + 's']));
// "Mentor" and "Coach" are nouns too ("Mentor to five graduates"); they open a bullet as verbs only before a person or a number.
const NOUN_OR_VERB = new Set(['mentor', 'mentors', 'coach', 'coaches']);
const PEOPLE = new Set(['junior', 'juniors', 'graduate', 'graduates', 'intern', 'interns', 'apprentice', 'apprentices', 'trainee', 'trainees',
  'student', 'students', 'staff', 'colleague', 'colleagues', 'peer', 'peers', 'analyst', 'analysts', 'engineer', 'engineers', 'developer', 'developers',
  'manager', 'managers', 'leader', 'leaders', 'volunteer', 'volunteers', 'member', 'members', 'employee', 'employees', 'learner', 'learners',
  'people', 'new', 'other', 'others', 'him', 'her', 'them', 'young']);
const COUNT = /^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|several|dozens|hundreds)$/;
const PAST_IRREGULAR = new Set(['led', 'built', 'ran', 'wrote', 'drove', 'grew', 'won', 'sold', 'taught', 'oversaw', 'made', 'kept', 'held', 'met',
  'spent', 'brought', 'bought', 'began', 'chose', 'took', 'gave', 'found', 'rebuilt', 'undertook']);
const NOT_PAST = new Set(['speed', 'embed', 'exceed', 'proceed', 'succeed', 'need', 'seed', 'feed', 'breed']);
const ABBREVIATION = /(?<![A-Za-z])(Snr|Sr|Jr|Mgr|Asst|Coord|Supv|Engr|Dept|Exec)\.?(?![A-Za-z])/i;

type ClarityRole = { name: string; title: string; start: string; end: string; bullets: string[]; target: CheckTarget };
type Line = { text: string; target: CheckTarget; bullet: boolean };

const finding = (id: string, title: string, detail: string, target: CheckTarget, level: CheckFinding['level'] = 'consider'): CheckFinding =>
  ({ id, category: 'clarity', level, title, detail, target, pointsLost: 1 });
const clip = (text: string) => (text.length > 80 ? text.slice(0, 77) + '...' : text);
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const joinAnd = (items: string[]) => (items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]);
const firstWord = (line: string) => (line.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
const isPast = (word: string) => PAST_IRREGULAR.has(word) || (/^[a-z]{3,}ed$/.test(word) && !NOT_PAST.has(word));
/** The bullet's first word for the tense check; empty when "Mentor" or "Coach" opens it as a noun. */
function openingVerb(line: string): string {
  const word = firstWord(line);
  if (!NOUN_OR_VERB.has(word)) return word;
  const next = (line.split(/\s+/)[1] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return COUNT.test(next) || PEOPLE.has(next) ? word : '';
}
const ongoing = (end: string) => !end.trim() || /^(?:present|current|now|today|ongoing)$/i.test(end.trim());

function rolesOf(resume: Resume): ClarityRole[] {
  const name = (title: string, organisation: string) => [title.trim(), organisation.trim()].filter(Boolean).join(' · ') || 'a role';
  return [
    ...resume.experience.map(e => ({ name: name(e.title, e.company), title: e.title, start: e.startDate, end: e.endDate, bullets: bulletsOf(e.achievements), target: 'experience' as const })),
    ...resume.volunteering.map(v => ({ name: name(v.role, v.organisation), title: v.role, start: v.startDate, end: v.endDate, bullets: bulletsOf(v.achievements), target: 'volunteering' as const })),
  ];
}

function fillerIn(text: string, bullet: boolean): string[] {
  const found: string[] = [];
  for (const re of FILLER) { const m = re.exec(text); if (m) found.push(m[0].toLowerCase()); }
  for (const re of FILLER_INSIDE) { const m = re.exec(text); if (m && (!bullet || m.index > 0)) found.push(m[0].toLowerCase()); }
  return found;
}

// One common ending; the earliest match wins, so "management" loses "ment" and "communicated" loses "ated".
const SUFFIX = /(?:ations?|ments?|ings?|ions?|ates?|ated|ers?|ed|es|(?<!s)s)$/;
/** A rough stem: one common ending removed, then a final "e" ("managed", "manages" and "management" all give "manag"). */
function stem(word: string): string {
  const base = word.replace(SUFFIX, '');
  return base.endsWith('e') ? base.slice(0, -1) : base;
}

/** A word used twice in one line, or two long words with the same stem ("managed the management", not "communicated with the community"). */
export function repeatedWord(line: string): string | null {
  const tokens = (line.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []).filter(t => t.length >= 4 && !COMMON.has(t));
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const a = tokens[i], b = tokens[j];
      if (a === b) return a;
      if (a.length >= 6 && b.length >= 6 && stem(a).length >= 4 && stem(a) === stem(b)) return `${a}/${b}`;
    }
  }
  return null;
}

function dateFormat(text: string): 'month' | 'numeric' | 'year' | null {
  const value = text.trim();
  if (/^[a-z]{3,}\.?\s+\d{4}$/i.test(value)) return 'month';
  if (/^\d{1,2}[/-]\d{4}$/.test(value)) return 'numeric';
  if (/^\d{4}$/.test(value)) return 'year';
  return null;
}

/** Clarity findings for the CV checker: each rule that finds something costs one point. */
export function clarityFindings(resume: Resume): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const roles = rolesOf(resume);
  const lines: Line[] = [
    ...roles.flatMap(r => r.bullets.map(text => ({ text, target: r.target, bullet: true }))),
    ...bulletsOf(resume.projects).map(text => ({ text, target: 'projects' as const, bullet: true })),
    ...(resume.summary.trim() ? [{ text: resume.summary, target: 'summary' as const, bullet: false }] : []),
  ];

  const passive = lines.filter(l => PASSIVE.test(l.text) || (l.bullet && PASSIVE_START.test(l.text)));
  if (passive.length) {
    findings.push(finding('clarity.passive', 'Say who did it',
      `${passive.length === 1 ? 'One line uses' : passive.length + ' lines use'} the passive voice, for example "${clip(passive[0].text)}". Start with what you did: "Managed the budget" rather than "The budget was managed by me".`, passive[0].target));
  }

  const filler = lines.map(l => ({ l, words: fillerIn(l.text, l.bullet) })).filter(x => x.words.length);
  if (filler.length) {
    const words = [...new Set(filler.flatMap(x => x.words))];
    findings.push(finding('clarity.filler', 'Cut filler words', `Cut or replace ${words.map(w => `'${w}'`).join(', ')}. Say exactly what you did instead.`, filler[0].l.target));
  }

  const longSentences = resume.summary.split(/(?<=[.!?])\s+/).filter(s => s.split(/\s+/).filter(Boolean).length > 30);
  if (longSentences.length) {
    findings.push(finding('clarity.sentences', 'Shorten long sentences in your summary',
      `${longSentences.length === 1 ? 'One sentence runs' : longSentences.length + ' sentences run'} past 30 words. Split each into two shorter sentences.`, 'summary'));
  }

  const repeats = lines.filter(l => l.bullet).map(l => ({ l, word: repeatedWord(l.text) })).filter(x => x.word);
  if (repeats.length) {
    findings.push(finding('clarity.repeat', 'Avoid repeating a word in one line',
      `Repeated: ${repeats.slice(0, 3).map(x => `'${x.word}'`).join(', ')}. Use a different word or cut one.`, repeats[0].l.target));
  }

  const tense = roles.map(r => {
    const starts = r.bullets.map(openingVerb);
    const present = starts.filter(w => PRESENT_FORMS.has(w));
    const past = starts.filter(isPast);
    if (!ongoing(r.end) && present.length) return `${r.name}: '${capitalise(present[0])}' should be past tense`;
    if (ongoing(r.end) && present.length && past.length) return `${r.name} mixes present ('${capitalise(present[0])}') and past ('${capitalise(past[0])}')`;
    return null;
  });
  const tenseRole = roles.find((_, i) => tense[i]);
  if (tenseRole) {
    findings.push(finding('clarity.tense', 'Keep each role in one tense',
      `${tense.filter(Boolean).slice(0, 2).join('; ')}. Use past tense for finished roles, and one tense within your current role.`, tenseRole.target, 'fix'));
  }

  const formats = new Map<string, string>();
  for (const r of roles) {
    for (const date of [r.start, r.end]) {
      const kind = dateFormat(date);
      if (kind && !formats.has(kind)) formats.set(kind, date.trim());
    }
  }
  if (formats.size > 1) {
    const datedRole = roles.find(r => dateFormat(r.start) || dateFormat(r.end))!;
    findings.push(finding('clarity.dates', 'Use one date format',
      `Your roles mix date formats: ${joinAnd([...formats.values()].map(d => `'${d}'`))}. Use one format throughout, for example '${formats.get('month') ?? 'Jan 2020'}'.`, datedRole.target, 'fix'));
  }

  const titled = [{ title: resume.personal.professionalTitle, name: 'your headline', target: 'profile' as CheckTarget }, ...roles.map(r => ({ title: r.title, name: r.name, target: r.target }))]
    .filter(t => ABBREVIATION.test(t.title));
  if (titled.length) {
    findings.push(finding('clarity.titles', 'Write job titles in full',
      `'${titled[0].title.trim()}' (${titled[0].name}). Recruiters and applicant tracking systems search for full words such as Senior, Manager and Assistant.`, titled[0].target));
  }
  return findings;
}
