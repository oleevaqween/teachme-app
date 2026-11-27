/**
 * The user's own writing rules (their "my-skill": guardrails, humanizer checks and narrative-prose rules),
 * adapted for CVs and letters. The app cannot run the skill, so its rules live here as prompt text for the
 * AI plus checks in code. Facts always win: callers pass the user's own text as `sources`, and a banned word
 * found there (a real term such as stakeholders, or a fact such as "promoted") is allowed.
 */
export type VoiceKind = 'letter' | 'summary' | 'bullet' | 'headline' | 'guidance';
export type VoiceTone = 'direct' | 'warm' | 'formal';
export type VoiceIssue = { rule: string; message: string; repairable: boolean };

/** Single words; simple inflections (s, es, d, ed, ing, ies, ied) are matched too. From the guardrails, sections 1a to 1e. */
const BANNED_WORDS = [
  'delve', 'leverage', 'utilize', 'utilise', 'harness', 'unlock', 'unleash', 'empower', 'facilitate', 'foster', 'bolster',
  'optimize', 'optimise', 'streamline', 'navigate', 'spearhead', 'underscore', 'illuminate', 'elucidate', 'embark', 'unravel',
  'elevate', 'reimagine', 'revolutionize', 'revolutionise', 'transcend', 'resonate', 'reverberate', 'showcase', 'grapple',
  'intertwine', 'entwine', 'weave', 'garner', 'espouse', 'evoke', 'exacerbate', 'exemplify', 'amplify', 'augment',
  'conceptualize', 'conceptualise', 'craft', 'embrace', 'enrich', 'glean', 'hinder', 'maximize', 'maximise', 'promote',
  'strive', 'tailor', 'thrive', 'unveil', 'uncover', 'champion',
  'multifaceted', 'nuanced', 'layered', 'intricate', 'seamless', 'robust', 'comprehensive', 'scalable', 'holistic',
  'meticulous', 'groundbreaking', 'transformative', 'innovative', 'vibrant', 'dynamic', 'compelling', 'invaluable',
  'paramount', 'enduring', 'indelible', 'poignant', 'timeless', 'relentless', 'tireless', 'sustainable', 'noteworthy',
  'commendable', 'exemplary', 'versatile', 'unprecedented', 'profound', 'captivating', 'daunting', 'bustling', 'burgeoning',
  'flourishing', 'granular', 'impactful', 'pervasive', 'systemic', 'unparalleled', 'unwavering', 'whimsical',
  'tapestry', 'realm', 'testament', 'beacon', 'myriad', 'liminal', 'kaleidoscope', 'landscape', 'ecosystem', 'paradigm',
  'nexus', 'catalyst', 'symphony', 'sentinel', 'interplay', 'intricacies', 'underpinnings', 'synergy', 'roadmap', 'toolkit',
  'facet', 'lens', 'quest', 'journey', 'endeavor', 'endeavour', 'groundwork', 'cornerstone', 'bedrock', 'pinnacle', 'crucible',
  'enigma', 'epicenter', 'epicentre', 'linchpin', 'milestone', 'plethora', 'stakeholder', 'trajectory', 'touchpoint',
  'bandwidth', 'deliverable', 'foray', 'hallmark', 'virtuoso',
  'furthermore', 'moreover', 'additionally', 'notably', 'crucially', 'importantly', 'consequently', 'seamlessly',
  'meticulously', 'intricately', 'profoundly', 'indelibly', 'tirelessly', 'relentlessly', 'remarkably', 'aptly',
  'accordingly', 'effortlessly', 'essentially', 'fundamentally', 'holistically', 'preemptively', 'synergistically',
  'undoubtedly', 'subsequently', 'conversely',
  'advent', 'akin', 'amidst', 'arduous', 'hence', 'herein', 'heretofore', 'thereby', 'therein', 'thereof', 'thus', 'whilst',
  'notwithstanding', 'nonetheless', 'nevertheless', 'namely',
];

/** Multi-word phrases from the guardrails, matched exactly (case-insensitive). */
const BANNED_PHRASES = [
  'cutting-edge', 'state-of-the-art', 'game-changing', 'ever-evolving', 'thought-provoking', 'mission-critical',
  'in the realm of', 'treasure trove', 'value proposition', 'pain point', 'paradigm shift', 'governance framework',
  'in addition', 'broadly speaking', 'generally speaking', 'in many cases', 'cannot be overstated',
  "in today's digital age", 'fast-paced world', 'now more than ever', 'in a world where', 'when it comes to',
  'one of the most important aspects', "it's important to note", 'it is important to note', "it's worth noting",
  'worth mentioning', "it's crucial to", 'it is essential to', 'this underscores', 'serves as a reminder', 'at its core',
  'at the heart of', 'keep in mind', 'simply put', 'in essence', 'in other words', 'that being said',
  'it goes without saying', 'from a broader perspective', 'paving the way', 'pushing the boundaries', 'a game-changer',
  'unlocking the power', 'reaching new heights', 'in conclusion', 'to wrap up', 'in summary', 'to sum up',
  'at the end of the day', 'the bottom line is', 'a key takeaway',
];

/** Stock openers and closers; never allowed, even when the user's sources contain them. */
const STOCK_PHRASES = [
  'i am writing to apply', 'i am writing to express', "i'm writing to apply", 'please accept my application',
  'i hope this email finds you', 'i hope this letter finds you', 'i trust this email finds you', 'i am keen to',
  'i recently had the pleasure of', 'best regards', 'warm regards', 'i hope this helps', "don't hesitate to",
  'feel free to reach out',
];

const ADVERB_STARTERS = ['furthermore', 'moreover', 'additionally', 'notably', 'crucially', 'importantly', 'consequently', 'interestingly'];
const ING_TAIL = /,\s+(?:highlighting|reflecting|showcasing|underscoring|contributing to|demonstrating|solidifying|cementing|emphasi[sz]ing)\b[^.!?\n]*[.!?]?/i;
const CONTRACTION = /\b(?:I'm|I've|I'll|I'd|can't|won't|don't|didn't|isn't|aren't|wasn't|it's|that's|we're|you're|they're|couldn't|wouldn't|shouldn't)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lower = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'");

function forms(word: string): string[] {
  const stem = word.replace(/e$/, '');
  return [...new Set([word, word + 's', word + 'es', word + 'd', word + 'ed', stem + 'ing', stem + 'ed', word.replace(/y$/, 'ies'), word.replace(/y$/, 'ied')])];
}
const WORD_PATTERNS = BANNED_WORDS.map(word => ({ word, pattern: new RegExp(`\\b(?:${forms(word).map(escape).join('|')})\\b`, 'gi') }));

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const WEEKDAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
const NUMBER = '[£$€₦]?\\d[\\d,.:]*(?:%|bn|am|pm|st|nd|rd|th|[kmKM])?';
const PERIOD = 'FY\\d{2,4}|H[12]|Q[1-4]';
const RANGE_LEFT = `(?:${NUMBER}|${MONTH}|${WEEKDAY}|${PERIOD})`;
const RANGE_RIGHT = `(?:${NUMBER}|${MONTH}|${WEEKDAY}|${PERIOD}|Present|present|Now|now|Today|date)`;
// An en dash may be spaced; an em dash is a range only with no spaces (a spaced em dash is an aside).
const RANGE_DASH = new RegExp(`(?<![\\p{L}\\d])(${RANGE_LEFT})(?:[ \\t]*–[ \\t]*|—)(${RANGE_RIGHT})(?![\\p{L}\\d])`, 'gu');

/** Mechanical fixes made in code (no AI): dashes, curly quotes, the ellipsis character and repeated spaces. Ranges, bullet markers and minus signs keep a hyphen; other dashes become commas. */
export function normalizeVoice(text: string): string {
  return text
    .replace(RANGE_DASH, '$1-$2')
    .replace(/^([ \t]*)[–—](?!\d)[ \t]*(?=\S)/gm, '$1- ')
    .replace(/(^|[ \t])[–—](?=\d)/gm, '$1-')
    .replace(/[ \t]*[—–][ \t]*/g, ', ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/,\s*([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/** The lines of `after` that are not lines of `before`, joined by new lines. */
export function changedLines(before: string, after: string): string {
  const kept = new Set(before.split('\n').map(line => line.trim()));
  return after.split('\n').filter(line => !kept.has(line.trim())).join('\n');
}

/** Normalises only the lines the AI changed; lines the user typed stay exactly as they were (whitespace-only edits count as unchanged). */
export function normalizeChangedLines(before: string, after: string): string {
  const original = new Map<string, string>();
  for (const line of before.split('\n')) if (!original.has(line.trim())) original.set(line.trim(), line);
  return after.split('\n').map(line => original.get(line.trim()) ?? normalizeVoice(line)).join('\n');
}

const ABBREVIATION = /\b(?:Dr|Mr|Mrs|Ms|Prof|vs)\.|\b(?:e\.g|i\.e|etc)\./gi;
const sentencesOf = (text: string) => text
  .replace(ABBREVIATION, m => m.replace(/\./g, '\u0000'))
  .split(/(?<=[.!?])\s+|\n+/)
  .map(s => s.replace(/\u0000/g, '.').trim())
  .filter(s => /\p{L}/u.test(s));

const SUBORDINATORS = /^(?:although|though|when|if|because|since|while|whereas|as|once|after|before|unless|until)\b/i;
const CORE_CONTRASTS = [
  /\bnot (?:just|only|merely|simply)\b[^.!?\n]*\bbut\b/i,
  /\brather than\b/i,
  /\bnot because\b[^.!?\n]*\bbut because\b/i,
];
const SPLIT_CONTRAST = /\b(?:is|was|are|were)(?: not|n't)\b[^.!?\n]{0,80}[.,]\s+(?:it's|it is|this is|that's|that is|they're|they are)\b/gi;

/** True when a "not X but Y" contrast appears. Only the "is not ..., it is" form skips sentences that open with a subordinator (a concession). */
function hasContrast(text: string): boolean {
  if (CORE_CONTRASTS.some(pattern => pattern.test(text))) return true;
  return [...text.matchAll(SPLIT_CONTRAST)].some(m => {
    let start = 0;
    for (const b of text.slice(0, m.index).matchAll(/[.!?]\s+|\n/g)) start = b.index + b[0].length;
    return !SUBORDINATORS.test(text.slice(start).trimStart());
  });
}

const boundaryPattern = (phrase: string) => new RegExp(`(?<![\\p{L}\\d])${escape(phrase)}(?![\\p{L}\\d])`, 'u');
const firstWord = (s: string) => lower(s).match(/^[\p{L}']+/u)?.[0] ?? '';

export function voiceIssues(text: string, kind: VoiceKind, sources = '', tone?: VoiceTone): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  const add = (rule: string, message: string, repairable = true) => { if (!issues.some(i => i.rule === rule)) issues.push({ rule, message, repairable }); };
  const own = lower(sources);
  for (const { word, pattern } of WORD_PATTERNS) {
    const found = text.match(pattern);
    if (!found) continue;
    if (forms(word).some(f => boundaryPattern(f).test(own))) continue;
    add('banned:' + word, `Avoid "${found[0]}": say it in plain words.`);
  }
  const plain = lower(text);
  for (const phrase of BANNED_PHRASES) if (boundaryPattern(phrase).test(plain) && !boundaryPattern(phrase).test(own)) add('phrase:' + phrase, `Avoid the stock phrase "${phrase}".`);
  for (const phrase of STOCK_PHRASES) if (boundaryPattern(phrase).test(plain)) add('stock:' + phrase, `Remove the stock phrase "${phrase}".`);
  if (text.includes(';')) add('semicolon', 'Replace the semicolon with a full stop, or a comma and a linking word.');
  const opener = '(?:i|we|it|they|he|she|you|this|that|these|those|there|then|so)';
  const item = `(?!${opener}\\b)\\p{L}[\\p{L}'-]*(?: \\p{L}[\\p{L}'-]*){0,2}`;
  if (new RegExp(`\\b\\p{L}[\\p{L}'-]*(?: \\p{L}[\\p{L}'-]*){0,2}, ${item}, (?:and|or) (?!${opener}\\b)\\p{L}`, 'iu').test(text)) add('oxford-comma', 'Drop the comma before the final "and" or "or" in the list.');
  if (hasContrast(text.replace(/[‘’]/g, "'"))) add('not-x-but-y', 'Say what it is directly instead of a "not X but Y" contrast.');
  if (/(?:^|[.!?]\s+)(?:the )?(?:best part|kicker|result|problem|truth|catch|secret)\?/i.test(text)) add('self-question', 'Remove the question-and-answer set-up and state the point.');
  if (kind !== 'bullet' && kind !== 'headline' && ING_TAIL.test(text)) add('ing-tail', 'Cut the trailing "-ing" commentary at the end of the sentence.');
  if (kind === 'bullet' || kind === 'headline') return issues;

  const sentences = sentencesOf(text);
  for (let i = 1; i < sentences.length; i++) {
    if (ADVERB_STARTERS.includes(firstWord(sentences[i - 1])) && ADVERB_STARTERS.includes(firstWord(sentences[i]))) add('adverb-starters', 'Do not start consecutive sentences with words like Furthermore or Moreover.');
  }
  for (let i = 2; i < sentences.length; i++) {
    const a = firstWord(sentences[i - 2]);
    if (a && a === firstWord(sentences[i - 1]) && a === firstWord(sentences[i])) add('same-openers', `Three sentences in a row start with "${a}"; vary how they begin.`, false);
  }
  if (kind === 'letter') {
    const paragraphs = text.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const body = paragraphs.slice(1, -1);
    if (body.some(p => sentencesOf(p).length === 1)) add('one-sentence-paragraph', 'Join one-sentence paragraphs to the paragraph they belong with.', false);
    if (body.some(p => sentencesOf(p).length > 5)) add('long-paragraph', 'Split paragraphs longer than five sentences.', false);
    if (tone === 'formal' && CONTRACTION.test(text.replace(/[‘’]/g, "'"))) add('formal-contractions', 'A formal letter reads better without contractions (I am, cannot).', false);
  }
  return issues;
}

export const voiceMessages = (issues: VoiceIssue[]) => issues.map(i => i.message);

const SHARED = `WRITING VOICE (the user's own rules; follow every one):
- Write like a specific, experienced person. Plain verbs (is, has, led, built) over grand ones.
- Never use these words or their forms: ${BANNED_WORDS.join(', ')}. Never use stock phrases such as ${BANNED_PHRASES.slice(0, 12).join(', ')}. Exception: a word the candidate already uses in their own CV or answers is allowed, because it is their real term or a fact.
- No em dashes or en dashes, no semicolons, no Oxford commas (no comma before the final "and" or "or" in a list), no ellipsis character, no bold or headings.
- No "not X but Y" contrasts in any form ("not just X but Y", "isn't X, it's Y", "X rather than Y", a contrast split across two sentences); state what the thing is directly.
- No self-posed questions answered at once ("The result? ..."), no staged run-ups or throat-clearing openers, no forced lists of three, no trailing "-ing" commentary (", highlighting ...", ", reflecting ..."), no sales language or inflated significance.
- Keep the candidate's tone. Do not add hype, jokes or opinions. Facts, names, numbers, quotes, job titles and company names are never changed to satisfy a style rule.`;

const BRIEFS: Record<VoiceKind, string> = {
  letter: `NARRATIVE PROSE: Write complete, connected sentences. No standalone fragments and no one-sentence body paragraphs; each body paragraph has 2 to 5 sentences and every sentence builds on the one before. Vary sentence length and join cause, contrast and sequence with linking words (because, although, while, once, after). Never open with "I am writing to apply" and never sign off with "Best regards" or "Warm regards"; use Kind regards, Yours sincerely, Yours faithfully, Sincerely or Regards.`,
  summary: `NARRATIVE PROSE: Write 2 to 3 complete, connected sentences in the first person without "I" at the start of every sentence. No fragments. Vary sentence length and use linking words for cause and sequence.`,
  bullet: `CV BULLETS: Keep the short CV form: an action verb, its context or scale, and the recorded result. One line each where possible. Narrative-prose rules do not apply to bullets; the word, punctuation and contrast rules do.`,
  headline: `HEADLINE: A short professional headline in the short CV form, made only of titles, fields and skills the CV already contains.`,
  guidance: `GUIDANCE: Plain, direct second-person advice in short connected sentences.`,
};

/** The voice brief for one kind, or several kinds sharing one WRITING VOICE block. */
export function voiceBrief(kind: VoiceKind | VoiceKind[], tone?: VoiceTone): string {
  const blocks = [...new Set(Array.isArray(kind) ? kind : [kind])].map(k => {
    const contractions = k === 'letter' ? (tone === 'formal' ? '\nDo not use contractions (write I am, cannot).' : '\nUse natural contractions where they read well (I\'m, it\'s, can\'t).') : '';
    return `${BRIEFS[k]}${contractions}`;
  });
  return `${SHARED}\n${blocks.join('\n')}`;
}
