import type { Suggestion } from './schema';

const WEAKER = /\b(assist(?:ed|ing)?|support(?:ed|ing)?|help(?:ed|ing)?|contribut(?:ed|ing)|participat(?:ed|ing)|worked on|part of|co-led|co-managed|co-lead)\b/i;
const STRONGER_WORDS = '(led|lead|leading|managed|managing|owned|owning|directed|directing|headed|heading|ran|running|drove|driving|spearheaded|oversaw|oversee|overseeing)';
const STRONGER = new RegExp(`(?<![\\w-])${STRONGER_WORDS}(?![\\w-])`, 'i');
/** Every stronger word in a text, in order (a global copy of STRONGER). */
const STRONGER_ALL = new RegExp(STRONGER.source, 'gi');
const QUALIFIERS = ['about', 'around', 'approximately', 'roughly', 'nearly', 'almost', 'more than', 'at least', 'up to', 'part of', 'co-', 'helped'];
/** Qualifiers with their own test: "co-" only as a shared-ownership prefix (not "co-ordinated" or "co-operate"); "up to" but not "up to date". */
const QUALIFIER_TESTS: Record<string, RegExp> = {
  'co-': /\bco-(?:lead|led|manag|found|author|own|chair|direct|ran|run|head|wr[io]t|design|creat|develop|present|host|supervis|facilitat|organi[sz]|deliver|sponsor|produc|edit|taught|teach|conven|moderat|investigat)/i,
  'up to': /\bup to\b(?![\s-]+date\b)/i,
};

// Tailoring only: these qualifiers count only when a number follows (digits, a currency sign or a number word).
// A small list, kept here because the fuller one in improve-rules.ts imports this module.
const NUMBER_WORD = '(?:a\\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|quarter|third)s?\\b';
// "N500,000", "N 500,000" and "NGN 500,000" are how naira amounts are often typed without the ₦ sign.
const NUMBER_AFTER = `(?:\\s*(?:\\d|\\p{Sc}|N\\d|N\\s\\d|NGN\\s?\\d)|\\s+${NUMBER_WORD})`;
const numeric = (pattern: string) => new RegExp(`${pattern}${NUMBER_AFTER}`, 'iu');
// Swapping within a group keeps the meaning, so any numeric member of the same group counts as kept.
const ABOUT_GROUP = [numeric('\\b(?:about|around|approximately|roughly|nearly|almost)'), numeric('(?<!\\w)c\\.'), numeric('~')];
const OVER_GROUP = [numeric('\\b(?:more than|over|at least)')];
const NUMERIC_KEPT: Record<string, RegExp[]> = {
  about: ABOUT_GROUP, around: ABOUT_GROUP, approximately: ABOUT_GROUP, roughly: ABOUT_GROUP, nearly: ABOUT_GROUP, almost: ABOUT_GROUP,
  'more than': OVER_GROUP, 'at least': OVER_GROUP, 'up to': [numeric('\\bup to')],
};

/** "Claims more ownership" when the original or its sources use a weaker word, the suggestion a stronger one, and the original no stronger one; `named` is the stronger word to name. */
function moreOwnership(before: string, sources: string, after: string, named?: string): string[] {
  const weaker = WEAKER.exec(before) ?? WEAKER.exec(sources);
  const stronger = named ?? STRONGER.exec(after)?.[1];
  return weaker && stronger && !STRONGER.test(before) ? [`Claims more ownership: the original says "${weaker[1]}", the suggestion says "${stronger}". Check this is accurate.`] : [];
}

/** "Drops ..." for each qualifier in the original or its sources that the suggestion leaves out; `numericOnly` applies the tailoring number and group rules. */
function droppedQualifiers(before: string, sources: string, after: string, numericOnly = false): string[] {
  const flags: string[] = [];
  for (const q of QUALIFIERS) {
    const kept = numericOnly ? NUMERIC_KEPT[q] : undefined;
    const test = kept ? numeric(`\\b${q}`) : QUALIFIER_TESTS[q] ?? new RegExp(`\\b${q}\\b`, 'i');
    const has = (s: string) => test.test(s);
    const keeps = kept ? (s: string) => kept.some(k => k.test(s)) : has;
    if ((has(before) || has(sources)) && !keeps(after)) flags.push(`Drops "${q}" from the original. Keep it if it is true.`);
  }
  return flags;
}

/** Warnings when a suggestion claims more ownership or certainty than the original or its sources (shared with Improve my CV). */
export function ownershipFlags(before: string, sources: string, after: string): string[] {
  return [...moreOwnership(before, sources, after), ...droppedQualifiers(before, sources, after)];
}

// "junior secondary" and "senior secondary" (also "junior and senior secondary") are school levels, not job levels.
const JUNIOR = /\b(junior(?![\s-]*(?:(?:and|or|&|\/)[\s-]*senior[\s-]+)?secondary\b)|assistant|intern|trainee|graduate)\b/i;
// "lead generation", "head office" and "headquarters" (also "head quarters") name things, not a level.
const SENIOR = /\b(senior(?![\s-]+secondary\b)|principal|manager|director|lead(?![\s-]+generation\b)|head(?![\s-]+(?:office|offices|quarters)\b))\b/gi;
const seniorWords = (text: string) => new Set([...text.matchAll(SENIOR)].map(m => m[1].toLowerCase()));

/** A warning when the original names a junior level and the suggestion adds a senior word that neither the original nor its sources contain. */
export function seniorityFlags(before: string, sources: string, after: string): string[] {
  const junior = JUNIOR.exec(before);
  if (!junior) return [];
  const known = seniorWords(before + '\n' + sources);
  const raised = [...after.matchAll(SENIOR)].find(m => !known.has(m[1].toLowerCase()));
  return raised ? [`Raises seniority: the original says "${junior[1]}", the suggestion says "${raised[1]}". Check this is accurate.`] : [];
}

/** The three rules for one original and its suggestion (a whole field or one pair of lines). */
function ruleFlags(before: string, sources: string, after: string): string[] {
  // The evidence backs the claim only when it uses every stronger word in the suggestion (whole word, any case); a stronger word in the original still suppresses it.
  const unbacked = [...after.matchAll(STRONGER_ALL)].map(m => m[1]).find(word => !new RegExp(`(?<![\\w-])${word}(?![\\w-])`, 'i').test(sources));
  const ownership = unbacked === undefined ? [] : moreOwnership(before, sources, after, unbacked);
  // Evidence quotes often cover whole fields, so only the original line counts for dropped qualifiers.
  return [...ownership, ...droppedQualifiers(before, '', after, true), ...seniorityFlags(before, sources, after)];
}

// Small words that say nothing about which bullet a line came from, so they do not count when pairing lines.
const PAIRING_STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'as', 'from', 'into', 'per']);
const nonEmptyLines = (text: string) => text.split(/\r\n?|\n/).filter(line => line.trim());
/** Lower-case words separated by single spaces, with bullets and punctuation dropped, for checking whether a quote is copied from a field. */
const normalised = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const pairingWords = (line: string) => new Set((line.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).filter(word => !PAIRING_STOP_WORDS.has(word)));

/** Each new line with the old line it shares the most words with (the first on a tie); new lines with too little overlap are left out. */
function pairLines(before: string, after: string): [string, string][] {
  const old = nonEmptyLines(before).map(line => ({ line, words: pairingWords(line) }));
  const pairs: [string, string][] = [];
  for (const line of nonEmptyLines(after)) {
    const words = pairingWords(line);
    let best: string | undefined, most = 0;
    for (const o of old) {
      const shared = [...words].filter(word => o.words.has(word)).length;
      if (shared > most) { best = o.line; most = shared; }
    }
    // Enough overlap: 2 shared words or 30% of the new line's words, whichever is smaller (at least 1).
    const needed = Math.max(1, Math.min(2, 0.3 * words.size));
    if (best !== undefined && most >= needed) pairs.push([best, line]);
  }
  return pairs;
}

/** Ownership, qualifier and seniority warnings for one tailoring suggestion; its evidence quotes are the sources. */
export function editFlags(s: Suggestion): string[] {
  const sources = s.evidence.map(e => e.quote).join('\n');
  const flags = ruleFlags(s.before, sources, s.after);
  // Bullet by bullet: a stronger word or a kept qualifier in one bullet must not hide a change in another.
  if (nonEmptyLines(s.before).length > 1 && nonEmptyLines(s.after).length > 1) {
    // A quote taken from the original field itself would bring back every other bullet's words; the paired old line already stands for it.
    // Compared as whole words, ignoring bullets and punctuation, piece by piece across line breaks and "…", so the AI's own formatting of the field still counts as the field.
    const field = ` ${normalised(s.before)} `;
    const fromField = (quote: string) => {
      const pieces = quote.split(/\r\n?|\n|…|\.\.\./).map(normalised).filter(Boolean);
      return pieces.length > 0 && pieces.every(piece => field.includes(` ${piece} `));
    };
    const otherSources = s.evidence.map(e => e.quote).filter(quote => quote.trim() && !fromField(quote)).join('\n');
    for (const [before, after] of pairLines(s.before, s.after)) flags.push(...ruleFlags(before, otherSources, after));
  }
  return [...new Set(flags)];
}

/**
 * One run of the word comparison. `text` is either exactly "\n" (one line break, never merged with
 * anything) or one or more words joined by single spaces. Words keep their punctuation; spaces and tabs
 * are separators only, so a change in spacing alone is not a change.
 */
export type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string };

/** Above this many comparisons the changed middle is shown as all removed then all added: still exact, less fine-grained. */
export const DIFF_CELL_LIMIT = 250_000;

/** Words (runs of non-space characters) and line breaks, in order; "\r\n" counts as one line break. */
function diffTokens(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').match(/\n|[^\s]+/g) ?? [];
}

/** The longest common subsequence of two word lists, as removed, added and unchanged tokens in order (removals first). */
function lcs(a: string[], b: string[]): { kind: DiffPart['kind']; token: string }[] {
  if (a.length * b.length > DIFF_CELL_LIMIT) return [...a.map(token => ({ kind: 'removed' as const, token })), ...b.map(token => ({ kind: 'added' as const, token }))];
  const width = b.length + 1;
  // length[i * width + j] is the common length of a[i..] and b[j..].
  const length = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      length[i * width + j] = a[i] === b[j] ? length[(i + 1) * width + j + 1] + 1 : Math.max(length[(i + 1) * width + j], length[i * width + j + 1]);
    }
  }
  const out: { kind: DiffPart['kind']; token: string }[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ kind: 'same', token: a[i] }); i++; j++; }
    else if (length[(i + 1) * width + j] >= length[i * width + j + 1]) out.push({ kind: 'removed', token: a[i++] });
    else out.push({ kind: 'added', token: b[j++] });
  }
  while (i < a.length) out.push({ kind: 'removed', token: a[i++] });
  while (j < b.length) out.push({ kind: 'added', token: b[j++] });
  return out;
}

/** A word-by-word comparison of `before` and `after` (case-sensitive), as runs of unchanged, removed and added words. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = diffTokens(before), b = diffTokens(after);
  // Unchanged words at both ends are matched directly, so only the changed middle needs the table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const tokens = [
    ...a.slice(0, start).map(token => ({ kind: 'same' as const, token })),
    ...lcs(a.slice(start, endA), b.slice(start, endB)),
    ...a.slice(endA).map(token => ({ kind: 'same' as const, token })),
  ];
  const parts: DiffPart[] = [];
  for (const { kind, token } of tokens) {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind && token !== '\n' && last.text !== '\n') last.text += ' ' + token;
    else parts.push({ kind, text: token });
  }
  return parts;
}

/** The fixed-rule warnings and word changes for one tailoring suggestion. */
export type EditCheck = { flags: string[]; changes: DiffPart[] };

/** The check for one suggestion, or null when it cannot be worked out (shown as "Change check unavailable."). */
export function editCheck(s: Suggestion): EditCheck | null {
  try {
    return { flags: editFlags(s), changes: wordDiff(s.before, s.after) };
  } catch {
    // Damaged saved data must not break the Review tab; a null check keeps the edit out of Apply all.
    return null;
  }
}

/** True when a suggestion must be accepted on its own: a rule fired or the check failed. */
export function isFlagged(s: Suggestion): boolean {
  const check = editCheck(s);
  return !check || check.flags.length > 0;
}
