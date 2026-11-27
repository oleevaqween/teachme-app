export const REWRITE_WITHHELD = 'This rewrite included details that are not in your answer or CV, so it was not shown.';

type Words = Record<string, number>;

const SMALL: Words = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const UNIT_WORDS = 'one|two|three|four|five|six|seven|eight|nine';
const TEEN_WORDS = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const TENS_WORDS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const MULTIPLIERS: Words = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, dozen: 12 };
const MULT_WORDS = Object.keys(MULTIPLIERS).join('|');
/** "first" and "second" are handled separately: they are ambiguous in everyday speech. */
const ORDINAL_WORDS: Words = { third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
/** Hyphenated or fixed compounds such as "third-party" and "second-hand" are not ordinals. */
const NOT_COMPOUND = '(?![-\\u2011]\\w)(?!\\s+party\\b)';

/** Number-word phrases; strict mode skips a bare "one" because it is almost always a pronoun. */
function numberWordsPattern(lenient: boolean): RegExp {
  const units = lenient ? UNIT_WORDS : UNIT_WORDS.replace('one|', '');
  const bareOne = lenient ? '' : `|one(?=\\s+(?:${MULT_WORDS}))`;
  const head = `a\\s+(?:${MULT_WORDS})|dozen|zero|(?:${TENS_WORDS})(?:[-\\s](?:${UNIT_WORDS}))?|${TEEN_WORDS}|${units}${bareOne}`;
  return new RegExp(`\\b(?:${head})(?:\\s+(?:${MULT_WORDS}))*\\b`, 'gi');
}
const STRICT_WORDS = numberWordsPattern(false);
const LENIENT_WORDS = numberWordsPattern(true);

/** "double-check", "double click" and "doubling down" are idioms, not a quantity. */
const SCALE_WORDS: Array<[RegExp, string]> = [
  [/\b(?:doubl(?:e|es|ed|ing)(?![-‑]|\s+(?:down|check\w*|click\w*|or nothing)\b)|twice)\b/gi, 'x2'],
  [/\b(?:tripl(?:e|es|ed|ing)(?![-‑])|thrice)\b/gi, 'x3'],
  [/\b(?:quadrupl(?:e|es|ed|ing))\b/gi, 'x4'],
  [/\b(?:half|halv(?:e|es|ed|ing))\b/gi, 'x0.5'],
];

/** Digits with valid thousands groups only ("1,2,3" is three numbers), optional decimals. */
const NUMBER = /(\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.(\d+))?/g;
// Attached ("5bn") or spaced ("5 bn", "5 m"); a spaced "m" must end the word so "5 managers" is not 5 million.
const MAGNITUDE = /^(?:(k|mn|m|bn|b)\b|\s(k|mn|m|bn)\b|\s?(hundred|thousand|million|billion)\b)/i;
const MAGNITUDE_VALUE: Words = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, ...MULTIPLIERS };
const PERCENT = /^(?:\s?%|\s?per ?cent\b)/i;
const ORDINAL = /^(?:st|nd|rd|th)\b/i;
/** Optional "+" and one filler adjective: "5+ years", "5 full years", "10 working days". */
const TIME_UNIT = /^\+?[\s-]?(?:(?:full|working|business|calendar|consecutive)[\s-])?(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|quarters?)\b/i;
const UNIT_ABBREVIATIONS: Record<string, string> = { sec: 'second', min: 'minute', hr: 'hour', wk: 'week', mo: 'month', yr: 'year' };
const FULL_UNITS = 'second|minute|hour|day|week|month|year';

/** Time unit as its singular full word, so "yrs", "year" and "years" agree. */
function unitName(raw: string): string {
  const singular = raw.toLowerCase().replace(/s$/, '');
  return UNIT_ABBREVIATIONS[singular] ?? singular;
}

const FOLD = /\b(\d+(?:\.\d+)?|two|three|four|five|six|seven|eight|nine|ten)[-\s]?fold\b/gi;
const TIMES = /(?<![\d,.])\b(\d+(?:\.\d+)?)\s?[x×](?!\w)/gi;
/** "3 times" and "two times" mean the same as "3x". */
const N_TIMES = /(?<![\d,.])\b(\d+(?:\.\d+)?|two|three|four|five|six|seven|eight|nine|ten)\s+times\b/gi;
const PLURAL_MAGNITUDE = /\b(hundred|thousand|million|billion)s\s+of\b/gi;
/** A fraction, not "third quarter of" or "Q3". */
const QUARTER_FRACTION = /\ba\s+quarter\b|(?<!\b(?:first|second|third|fourth|last|next|this|each|every|[1-4](?:st|nd|rd|th))\s)\bquarter\s+of\b/i;

/** Canonical string for a number: no float noise, no trailing zeros. */
function canon(value: number): string {
  return String(Number(value.toPrecision(15)));
}

function parseWordPhrase(phrase: string): number {
  let value = 0;
  for (const token of phrase.toLowerCase().split(/[\s-]+/)) {
    if (token === 'a') continue;
    value = token in SMALL ? value + SMALL[token] : (value || 1) * MULTIPLIERS[token];
  }
  return value;
}

/** Reads "twofold", "10-fold" and "3x" as multiplier facts and blanks them so their digits are not read again. */
function takeMultiples(text: string): { rest: string; facts: string[] } {
  const facts: string[] = [];
  const take = (_match: string, n: string): string => {
    const key = n.toLowerCase();
    facts.push(`x${canon(key in SMALL ? SMALL[key] : Number(key))}`);
    return ' ';
  };
  return { rest: text.replace(FOLD, take).replace(TIMES, take).replace(N_TIMES, take), facts };
}

/** Facts that are phrases rather than digits: "thousands of", "a quarter of". */
function phraseFacts(text: string): string[] {
  const facts = [...text.matchAll(PLURAL_MAGNITUDE)].map(match => `many:${match[1].toLowerCase()}`);
  if (QUARTER_FRACTION.test(text)) facts.push('x0.25');
  return facts;
}

/** Rewrites spelled-out numbers and ordinals as digits so one extractor handles both forms. */
function digitise(text: string, lenient: boolean): string {
  // Sources only: "a year" and "an hour" mean one.
  let out = lenient ? text.replace(new RegExp(`\\b(?:a|an)\\s+(${FULL_UNITS})\\b`, 'gi'), '1 $1') : text;
  out = out.replace(new RegExp(`\\b(third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\b${NOT_COMPOUND}`, 'gi'), w => `${ORDINAL_WORDS[w.toLowerCase()]}th`);
  if (lenient) {
    const ordinals: Words = { first: 1, second: 2 };
    // Leave "30-second" alone: there "second" is a time unit after a number.
    out = out.replace(new RegExp(`\\b(first|second)\\b${NOT_COMPOUND}`, 'gi'), (w, _g, offset: number, whole: string) =>
      /\d[\s-]*$/.test(whole.slice(0, offset)) ? w : `${ordinals[w.toLowerCase()]}th`);
  }
  return out
    .replace(lenient ? LENIENT_WORDS : STRICT_WORDS, phrase => String(parseWordPhrase(phrase)))
    .replace(/(\d+)[\s-]decades?\b/gi, (_m, n: string) => `${Number(n) * 10} years`)
    .replace(/\b(?:a\s+)?decades?\b/gi, '10 years');
}

function digitFacts(text: string): string[] {
  const facts: string[] = [];
  for (const match of text.matchAll(NUMBER)) {
    let value = Number(`${match[1].replace(/,/g, '')}${match[2] ? `.${match[2]}` : ''}`);
    let rest = text.slice(match.index + match[0].length);
    // "B2B" and "P2P" are not magnitudes; a lone currency "N" ("N2m") still is.
    const before = text.slice(Math.max(0, match.index - 2), match.index);
    const letterBefore = /[A-Za-z]$/.test(before) && !/(?:^|[^A-Za-z])N$/.test(before);
    const scale = letterBefore ? null : MAGNITUDE.exec(rest);
    if (scale) {
      value *= MAGNITUDE_VALUE[(scale[1] ?? scale[2] ?? scale[3]).toLowerCase()];
      rest = rest.slice(scale[0].length);
    }
    const unit = TIME_UNIT.exec(rest);
    if (PERCENT.test(rest)) facts.push(`${canon(value)}%`);
    else if (!scale && !match[2] && ORDINAL.test(rest)) facts.push(`ord:${canon(value)}`);
    else if (unit) facts.push(`${canon(value)} ${unitName(unit[1])}`);
    else facts.push(canon(value));
  }
  return facts;
}

/**
 * Distinct numeric facts in a text as canonical tokens, so "₦2 million", "2m" and
 * "N2,000,000" all give "2000000". Strict by default (used for the rewrite);
 * `lenient` also reads "one", "first", "second" and "a year", and lets every plain
 * number double as a day-of-month ordinal (used for the sources).
 */
export function numericFacts(text: string, options: { lenient?: boolean } = {}): string[] {
  const lenient = options.lenient ?? false;
  const scales = SCALE_WORDS.filter(([pattern]) => text.match(pattern)).map(([, fact]) => fact);
  const { rest, facts: multiples } = takeMultiples(text);
  const digits = digitFacts(digitise(rest, lenient));
  const dayOrdinals = lenient ? digits.filter(fact => /^\d+$/.test(fact)).map(fact => `ord:${fact}`) : [];
  return [...new Set([...digits, ...dayOrdinals, ...multiples, ...phraseFacts(text), ...scales])];
}

/**
 * Withholds an AI rewrite that states any number not present in the user's own
 * answer or CV facts, so invented figures never reach the user as "their" answer.
 */
export function guardRewrite(rewrite: string | null, sources: string[]): { rewrite: string | null; rewriteWithheld: string | null } {
  if (!rewrite) return { rewrite: null, rewriteWithheld: null };
  const allowed = new Set(sources.flatMap(source => numericFacts(source, { lenient: true })));
  const invented = numericFacts(rewrite).filter(fact => !allowed.has(fact));
  return invented.length ? { rewrite: null, rewriteWithheld: REWRITE_WITHHELD } : { rewrite, rewriteWithheld: null };
}
