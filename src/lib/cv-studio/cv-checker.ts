import { profileText, type Market, type Resume } from './schema';
import { clarityFindings, hasFigure } from './clarity';
import { bulletsOf } from './cv-text';
import { lengthTarget, marketAdvice } from './market';
import { rowHasText, sectionHasContent } from './sections';

export type CheckCategory = 'impact' | 'wording' | 'completeness' | 'structure' | 'clarity';
export type CheckTarget = 'profile' | 'summary' | 'experience' | 'volunteering' | 'projects' | 'education' | 'skills'
  | 'certifications' | 'additional' | 'awards' | 'training' | 'publications' | 'strengths' | 'interests' | 'references' | 'design';
export type SpellingWord = { word: string; suggestions: string[]; target: CheckTarget; where: string };
export type SpellingResult = { variant: 'en-GB' | 'en-US'; words: SpellingWord[]; variantWords: SpellingWord[] };
export type SpellingOutcome = { status: 'pending' } | { status: 'failed' } | { status: 'done'; result: SpellingResult };
export type CheckLabel = 'Excellent' | 'Good' | 'Needs work' | 'Getting started';
export type CheckFinding = { id: string; category: CheckCategory; level: 'fix' | 'consider'; title: string; detail: string; target: CheckTarget; pointsLost: number; words?: SpellingWord[] };
export type CvCheck = {
  score: number;
  label: CheckLabel;
  categories: { id: CheckCategory; title: string; earned: number; possible: number }[];
  findings: CheckFinding[];
  /** Whether the dictionary check has finished; until then spelling scores full marks. */
  spelling: SpellingOutcome['status'];
};

/** What the CV is aimed at; without it the checker uses International / UK and gives no paper-size advice (the page size is used only once a market is set). */
export type CheckContext = { market?: Market; pageSize?: 'A4' | 'LETTER' };

export const HONEST_FIGURES = "Add a real figure if you have one (team size, budget, time saved, volume). Don't make one up.";

const ACTION_VERBS = new Set([
  'led', 'managed', 'delivered', 'built', 'created', 'designed', 'developed', 'launched', 'improved', 'increased',
  'reduced', 'cut', 'saved', 'grew', 'negotiated', 'organised', 'organized', 'coordinated', 'implemented', 'analysed',
  'analyzed', 'trained', 'mentored', 'resolved', 'streamlined', 'automated', 'achieved', 'won', 'secured', 'produced',
  'wrote', 'presented', 'planned', 'supervised', 'directed', 'established', 'introduced', 'optimised', 'optimized',
  'restructured', 'migrated', 'tested', 'supported', 'handled', 'prepared', 'oversaw', 'owned', 'drove', 'spearheaded',
  'executed', 'generated', 'expanded', 'raised', 'boosted', 'accelerated', 'shortened', 'lowered', 'eliminated', 'prevented',
  'audited', 'assessed', 'evaluated', 'researched', 'investigated', 'identified', 'defined', 'drafted', 'edited', 'published',
  'taught', 'coached', 'hired', 'recruited', 'onboarded', 'scheduled', 'budgeted', 'forecast', 'forecasted', 'modelled',
  'modeled', 'engineered', 'programmed', 'coded', 'deployed', 'integrated', 'configured', 'maintained', 'upgraded', 'repaired',
  'served', 'sold', 'closed', 'converted', 'partnered', 'facilitated', 'chaired', 'represented', 'advised', 'consulted',
  'translated', 'shipped', 'scaled', 'standardised', 'standardized', 'documented', 'monitored', 'tracked', 'reported', 'reviewed',
  'collaborated', 'conducted', 'provided', 'ensured', 'performed', 'contributed', 'initiated', 'ran', 'processed', 'communicated',
  'redesigned', 'revamped', 'pioneered', 'completed', 'operated', 'consolidated', 'transformed', 'authored',
  // present tense, for a current role
  'lead', 'manage', 'deliver', 'build', 'create', 'design', 'develop', 'launch', 'improve', 'increase', 'reduce', 'save', 'grow',
  'negotiate', 'organise', 'organize', 'coordinate', 'implement', 'analyse', 'analyze', 'train', 'mentor', 'resolve', 'streamline',
  'automate', 'achieve', 'win', 'secure', 'produce', 'write', 'present', 'plan', 'supervise', 'direct', 'establish', 'introduce',
  'optimise', 'optimize', 'restructure', 'migrate', 'test', 'support', 'handle', 'prepare', 'oversee', 'own', 'drive', 'spearhead',
  'execute', 'run', 'collaborate', 'conduct', 'provide', 'ensure', 'perform', 'contribute', 'initiate', 'process', 'communicate',
  'redesign', 'revamp', 'pioneer', 'complete', 'operate', 'maintain', 'monitor', 'generate', 'expand', 'partner', 'facilitate',
  'evaluate', 'research', 'review', 'configure', 'deploy', 'engineer', 'consolidate', 'standardise', 'standardize', 'transform',
  'accelerate', 'recruit', 'hire', 'coach', 'teach', 'advise', 'sell', 'close', 'raise', 'author', 'edit', 'publish', 'translate',
]);
export const WEAK_OPENINGS = ['responsible for', 'helped', 'worked on', 'assisted', 'duties included', 'tasked with', 'involved in', 'participated in', 'in charge of'];
const CLICHES = ['team player', 'hard-working', 'results-driven', 'detail-oriented', 'go-getter', 'synergy', 'think outside the box', 'self-starter', 'dynamic', 'passionate about', 'proven track record', 'best of breed'];
/** Ambiguous in real achievements ("a dynamic pricing model"), so only searched in the headline and summary. */
const HEADLINE_SUMMARY_ONLY = new Set(['dynamic', 'synergy']);
const PERSONAL_PREFIX = /(tier|phase|level|grade|stage|type)\s+$/i;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const words = (text: string) => text.split(/\s+/).filter(Boolean);
const firstWord = (text: string) => (words(text)[0] ?? '').toLowerCase().replace(/[^a-z'-]/g, '');

/** True when the text starts with one of the checker's strong action verbs. */
export function startsWithActionVerb(text: string): boolean {
  return ACTION_VERBS.has(firstWord(text));
}
const hasPhrase = (text: string, phrase: string) => new RegExp('(^|[^a-z])' + phrase + '([^a-z]|$)', 'i').test(text);
const round1 = (value: number) => Math.round(value * 10) / 10;
const quote = (text: string) => "'" + text + "'";
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** True when a line speaks in the first person ("I led", "my role"). Tier I, i.e., I.T. and all-caps ME do not count. */
function usesFirstPerson(line: string): boolean {
  for (const match of line.matchAll(/\bI\b(?!\.)/g)) {
    if (!PERSONAL_PREFIX.test(line.slice(0, match.index))) return true;
  }
  return [...line.matchAll(/\b(?:my|me)\b/gi)].some(match => match[0] !== 'ME');
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Month number (year * 12 + month index) for common CV date formats, or null. */
export function parseCvDate(text: string, edge: 'start' | 'end', now: Date = new Date()): number | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  if (/^(present|current|now|today)$/.test(value)) return edge === 'end' ? now.getFullYear() * 12 + now.getMonth() : null;
  let match = /^(\d{4})$/.exec(value);
  if (match) return Number(match[1]) * 12 + (edge === 'start' ? 0 : 11);
  // Month then year: 03/2021, 3-2021, 03.2021.
  match = /^(\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match) {
    const month = Number(match[1]);
    return month >= 1 && month <= 12 ? Number(match[2]) * 12 + month - 1 : null;
  }
  // Year then month (ISO style): 2019-03, 2019/03, 2019-03-15 (the day is not needed).
  match = /^(\d{4})[/-](\d{1,2})(?:[/-]\d{1,2})?$/.exec(value);
  if (match) {
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? Number(match[1]) * 12 + month - 1 : null;
  }
  match = /^([a-z]+)\.?\s+(\d{4})$/.exec(value);
  if (match) {
    const name = match[1];
    const index = name.length >= 3 ? MONTHS.findIndex(month => month.startsWith(name)) : -1;
    return index >= 0 ? Number(match[2]) * 12 + index : null;
  }
  return null;
}

/** Each area's points were rescaled when Spelling & clarity joined the score: Impact 35 to 30, Wording 20 to 15, Length & structure 20 to 15. */
const SCALE: Record<CheckCategory, number> = { impact: 30 / 35, wording: 15 / 20, completeness: 1, structure: 15 / 20, clarity: 1 };

export function checkCv(resume: Resume, now: Date = new Date(), spelling: SpellingOutcome = { status: 'pending' }, context: CheckContext = {}): CvCheck {
  const findings: CheckFinding[] = [];
  const add = (finding: CheckFinding) => findings.push({ ...finding, pointsLost: round1(finding.pointsLost * SCALE[finding.category]) });
  type Role = { e: { id: string; title: string; company: string; startDate: string; endDate: string }; name: string; bullets: string[]; target: CheckTarget };
  const roleName = (title: string, organisation: string) => [title.trim(), organisation.trim()].filter(Boolean).join(' · ') || 'a role';
  const experienceRoles: Role[] = resume.experience.map(e => ({ e, name: roleName(e.title, e.company), bullets: bulletsOf(e.achievements), target: 'experience' }));
  const volunteerRoles: Role[] = resume.volunteering.filter(rowHasText).map(v => ({
    e: { id: v.id, title: v.role, company: v.organisation, startDate: v.startDate, endDate: v.endDate },
    name: roleName(v.role, v.organisation), bullets: bulletsOf(v.achievements), target: 'volunteering',
  }));
  const workRoles = [...experienceRoles, ...volunteerRoles];
  // A CV with only projects is scored on its project lines, as one pseudo-role.
  const projectLines = bulletsOf(resume.projects);
  const projectsOnly = workRoles.length === 0 && projectLines.length > 0;
  const roles: Role[] = projectsOnly
    ? [{ e: { id: 'projects', title: 'Projects', company: '', startDate: '', endDate: '' }, name: 'Projects', bullets: projectLines, target: 'projects' }]
    : workRoles;
  // Findings about all bullets point at Experience when any job is listed; otherwise at the only kind of role there is.
  const bulletTarget: CheckTarget = projectsOnly ? 'projects' : experienceRoles.length || !volunteerRoles.length ? 'experience' : 'volunteering';
  const bullets = roles.flatMap(role => role.bullets);

  // Impact (35, scaled to 30)
  let quantified = 0, openings = 0, length = 0, perRole = 0;
  if (!bullets.length) {
    add({ id: 'impact.no-bullets', category: 'impact', level: 'fix', title: 'Add achievements to your experience', detail: 'List what you did in each role, one achievement per line.', target: bulletTarget, pointsLost: 15 });
  } else {
    const withNumber = bullets.filter(b => hasFigure(b)).length;
    const ratio = withNumber / bullets.length;
    quantified = 15 * Math.min(1, ratio / 0.5);
    if (ratio < 0.5) {
      const worst = [...roles].sort((a, b) => b.bullets.filter(x => !hasFigure(x)).length - a.bullets.filter(x => !hasFigure(x)).length)[0];
      add({ id: 'impact.numbers', category: 'impact', level: 'fix', title: 'Add real numbers to more achievements',
        detail: `${bullets.length - withNumber} of ${plural(bullets.length, 'bullet')} ${bullets.length - withNumber === 1 ? 'has' : 'have'} no figure (most in ${worst.name}). ${HONEST_FIGURES}`, target: bulletTarget, pointsLost: 15 - quantified });
    }

    const strongCount = bullets.filter(b => ACTION_VERBS.has(firstWord(b))).length;
    openings = 10 * Math.min(1, strongCount / bullets.length / 0.8);
    const weak = WEAK_OPENINGS.map(phrase => ({ phrase, role: roles.find(role => role.bullets.some(b => b.toLowerCase().startsWith(phrase))) })).filter(x => x.role);
    for (const { phrase, role } of weak) {
      add({ id: 'impact.weak.' + phrase, category: 'impact', level: openings >= 10 - 1e-9 ? 'consider' : 'fix', title: `Start with what you did, not ${quote(capitalise(phrase))}`,
        detail: `In ${role!.name}. Say what you yourself did, for example "Built...", "Wrote..." or "Ran...". If you supported someone else's work, describe your part accurately.`, target: role!.target, pointsLost: (10 - openings) / weak.length });
    }
    if (!weak.length && strongCount / bullets.length < 0.8) {
      add({ id: 'impact.verbs', category: 'impact', level: 'consider', title: 'Lead more bullets with an action verb',
        detail: `${strongCount} of ${plural(bullets.length, 'bullet')} ${strongCount === 1 ? 'starts' : 'start'} with a strong verb such as led, built, improved or reduced.`, target: bulletTarget, pointsLost: 10 - openings });
    }

    const long = bullets.filter(b => words(b).length > 30).length;
    const short = bullets.filter(b => words(b).length < 6).length;
    length = 5 * (bullets.length - long - short) / bullets.length;
    if (long) add({ id: 'impact.long', category: 'impact', level: 'consider', title: 'Shorten long bullets', detail: `${plural(long, 'bullet')} ${long === 1 ? 'runs' : 'run'} past 30 words; keep each to one idea.`, target: bulletTarget, pointsLost: (5 - length) * long / (long + short) });
    if (short) add({ id: 'impact.short', category: 'impact', level: 'consider', title: 'Expand very short bullets', detail: `${plural(short, 'bullet')} ${short === 1 ? 'has' : 'have'} fewer than 6 words; say what you did and what changed.`, target: bulletTarget, pointsLost: (5 - length) * short / (long + short) });
  }
  if (roles.length) {
    perRole = 5 * roles.filter(role => role.bullets.length >= 2).length / roles.length;
    for (const role of roles.filter(r => r.bullets.length < 2)) {
      add({ id: 'impact.thin.' + role.e.id, category: 'impact', level: 'consider', title: `Add at least two achievements to ${role.name}`, detail: 'Two or three specific achievements per role show the scope of your work.', target: role.target, pointsLost: 5 / roles.length });
    }
  }
  const impact = quantified + openings + length + perRole;

  // Wording (20, scaled to 15)
  const unhyphenate = (text: string) => text.replace(/hardworking/gi, 'hard-working');
  const headlineText = unhyphenate(resume.personal.professionalTitle);
  const summaryText = unhyphenate(resume.summary);
  const bulletText = unhyphenate(bullets.join('\n'));
  const inSummary = (phrase: string) => hasPhrase(summaryText, phrase);
  const inBullets = (phrase: string) => !HEADLINE_SUMMARY_ONLY.has(phrase) && hasPhrase(bulletText, phrase);
  const cliches = CLICHES.filter(phrase => hasPhrase(headlineText, phrase) || inSummary(phrase) || inBullets(phrase));
  const clichePoints = Math.max(0, 6 - 2 * cliches.length);
  if (cliches.length) {
    add({ id: 'wording.cliches', category: 'wording', level: 'fix', title: 'Replace generic phrases', detail: `Swap ${cliches.map(quote).join(', ')} for a specific example of what you did.`,
      target: cliches.some(inSummary) ? 'summary' : cliches.some(inBullets) ? bulletTarget : 'profile', pointsLost: 6 - clichePoints });
  }
  const sentences = resume.summary.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const personal = [...bullets, ...sentences].filter(usesFirstPerson).length;
  const personalPoints = personal === 0 ? 5 : personal <= 2 ? 2 : 0;
  if (personal) {
    add({ id: 'wording.first-person', category: 'wording', level: 'consider', title: "Drop 'I' and 'my'", detail: `${personal} line${personal === 1 ? ' uses' : 's use'} I, my or me. CVs usually leave these out: "Led the team" rather than "I led my team".`,
      target: bullets.some(usesFirstPerson) ? bulletTarget : 'summary', pointsLost: 5 - personalPoints });
  }
  const openingCounts = new Map<string, number>();
  for (const b of bullets) { const word = firstWord(b); if (word) openingCounts.set(word, (openingCounts.get(word) ?? 0) + 1); }
  // Flag only a real pattern: 3 or more bullets share a first word and they are over a quarter of all bullets.
  const repeated = [...openingCounts.entries()].filter(([, count]) => count >= 3 && count / bullets.length > 0.25).sort((a, b) => b[1] - a[1])[0];
  const repeatPoints = repeated ? 0 : 4;
  if (repeated) add({ id: 'wording.repeated', category: 'wording', level: 'consider', title: `Vary how bullets start: ${repeated[1]} begin with ${quote(repeated[0])}`, detail: 'Use different verbs so each achievement stands out.', target: bulletTarget, pointsLost: 4 });
  const duplicate = new Set(bullets.map(b => b.toLowerCase())).size < bullets.length;
  const duplicatePoints = duplicate ? 0 : 5;
  if (duplicate) add({ id: 'wording.duplicate', category: 'wording', level: 'fix', title: 'Remove the repeated achievement', detail: 'At least two bullets have identical wording.', target: bulletTarget, pointsLost: 5 });
  const wording = clichePoints + personalPoints + repeatPoints + duplicatePoints;

  // Completeness (25)
  const p = resume.personal;
  let completeness = 0;
  const need = (ok: boolean, points: number, finding: Omit<CheckFinding, 'category' | 'pointsLost'>) => {
    if (ok) completeness += points;
    else add({ ...finding, category: 'completeness', pointsLost: points });
  };
  need(!!p.fullName.trim(), 4, { id: 'complete.name', level: 'fix', title: 'Add your name', detail: 'Your CV needs your full name at the top.', target: 'profile' });
  need(!!(p.email.trim() || p.phone.trim()), 4, { id: 'complete.contact', level: 'fix', title: 'Add an email or phone number', detail: 'Give employers at least one way to reach you.', target: 'profile' });
  if (p.email.trim()) need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()), 2, { id: 'complete.email', level: 'fix', title: 'Check your email address', detail: "This doesn't look like a valid address: " + p.email.trim(), target: 'profile' });
  else if (p.phone.trim()) completeness += 2;
  need(!!p.professionalTitle.trim(), 3, { id: 'complete.headline', level: 'fix', title: 'Add a professional headline', detail: 'A short line under your name, such as "Project Manager · Logistics".', target: 'profile' });
  need(!!p.location.trim(), 2, { id: 'complete.location', level: 'consider', title: 'Add your location', detail: 'A city and country is enough.', target: 'profile' });
  need(words(resume.summary).length >= 25, 3, { id: 'complete.summary', level: 'fix', title: 'Write a summary of at least 25 words', detail: 'Two or three sentences on your experience, focus and strongest contribution.', target: 'summary' });
  // A volunteering or education row left completely blank prints nothing, so it does not count.
  const hasExperience = resume.experience.length > 0 || sectionHasContent(resume, 'volunteering') || !!resume.projects.trim();
  const incompleteJob = resume.experience.some(e => !e.title.trim() || !e.company.trim());
  const incompleteVolunteering = resume.volunteering.filter(rowHasText).some(v => !v.role.trim() || !v.organisation.trim());
  if (!hasExperience) add({ id: 'complete.experience', category: 'completeness', level: 'fix', title: 'Show your experience', detail: 'Add roles, internships, volunteering or projects.', target: 'experience', pointsLost: 3 });
  else if (incompleteJob || incompleteVolunteering) { completeness += 1.5; add({ id: 'complete.roles', category: 'completeness', level: 'fix', title: 'Complete every role', detail: 'Each role needs a job title and an organisation.', target: incompleteJob ? 'experience' : 'volunteering', pointsLost: 1.5 }); }
  else completeness += 3;
  need(sectionHasContent(resume, 'education'), 2, { id: 'complete.education', level: 'consider', title: 'Add your education', detail: 'Include your highest qualification, or training that is relevant.', target: 'education' });
  need(!!resume.skills.trim(), 2, { id: 'complete.skills', level: 'fix', title: 'List your skills', detail: 'Add the tools and skills you genuinely use.', target: 'skills' });

  // Length and structure (20, scaled to 15)
  const market = context.market ?? 'international';
  const target = lengthTarget(market, resume, now);
  const total = words(profileText(resume)).length;
  const totalPoints = total >= 300 && total <= target.long ? 8 : (total >= 200 && total < 300) || (total > target.long && total <= target.long + 200) ? 4 : 0;
  if (total < 300) add({ id: 'structure.short', category: 'structure', level: 'consider', title: 'Your CV is short', detail: `${total} words. Most strong CVs use 300 to ${target.long} words; add achievements, projects or skills you genuinely have.`, target: 'experience', pointsLost: 8 - totalPoints });
  if (total > target.long) add({ id: 'structure.long', category: 'structure', level: 'consider', title: 'Your CV is long', detail: `${total} words. ${target.advice}, and keep the full history in your master CV.`, target: 'experience', pointsLost: 8 - totalPoints });
  const summaryWords = words(resume.summary).length;
  // Under 25 words the Completeness check already reports (and scores) the summary: no repeat here, and no points
  // taken here either, so every lost point has a finding that explains it.
  const summaryPoints = summaryWords < 25 || (summaryWords >= 30 && summaryWords <= 90) ? 4 : summaryWords < 30 || summaryWords <= 140 ? 2 : 0;
  if (summaryWords >= 25 && summaryPoints < 4) {
    add({ id: 'structure.summary', category: 'structure', level: 'consider', title: summaryWords < 30 ? 'Expand your summary' : 'Tighten your summary', detail: `${summaryWords} words; 30 to 90 is a good length.`, target: 'summary', pointsLost: 4 - summaryPoints });
  }
  const dated = workRoles.map(role => ({ ...role, start: parseCvDate(role.e.startDate, 'start', now), end: parseCvDate(role.e.endDate, 'end', now) }));
  const backwards = dated.filter(role => role.start !== null && role.end !== null && role.start > role.end);
  for (const role of backwards) add({ id: 'structure.dates.' + role.e.id, category: 'structure', level: 'fix', title: `Check the dates for ${role.name}`, detail: 'The end date is before the start date.', target: role.target, pointsLost: 4 / backwards.length });
  const datePoints = backwards.length ? 0 : 4;
  const ordered = dated.filter(role => role.start !== null && role.end !== null && role.start <= role.end).sort((a, b) => a.start! - b.start!);
  let gapFound = false;
  let latest = ordered[0];
  for (const next of ordered.slice(1)) {
    const gap = next.start! - latest.end! - 1; // empty months between the roles
    if (gap > 6) {
      gapFound = true;
      add({ id: `structure.gap.${latest.e.id}.${next.e.id}`, category: 'structure', level: 'consider', title: `Explain the gap between ${latest.name} and ${next.name}`,
        // Two volunteering roles lead to Volunteering; a gap involving a job leads to Experience.
        detail: `About ${gap} months between these roles. If it is true, list study, caring, volunteering or projects from that time.`, target: latest.target === next.target ? next.target : 'experience', pointsLost: 4 });
    }
    if (next.end! > latest.end!) latest = next;
  }
  // Market conventions are advice only: shown here, never scored.
  for (const advice of marketAdvice(resume, market, context.market ? context.pageSize : undefined)) add({ ...advice, category: 'structure', level: 'consider', pointsLost: 0 });
  const structure = totalPoints + summaryPoints + datePoints + (gapFound ? 0 : 4);

  // Spelling & clarity (15): spelling 10, scored only once the dictionary check has finished; clarity 5.
  const clarityList = clarityFindings(resume);
  for (const finding of clarityList) add(finding);
  let spellingPoints = 10;
  if (spelling.status === 'done') {
    const { words: misspelt, variantWords, variant } = spelling.result;
    const chosen = variant === 'en-GB' ? 'British' : 'American';
    const otherName = variant === 'en-GB' ? 'American' : 'British';
    if (misspelt.length) {
      add({ id: 'spelling.words', category: 'clarity', level: 'fix', title: `Check the spelling of ${plural(misspelt.length, 'word')}`,
        detail: `Not in the ${chosen} English dictionary. If a word is a name or a term you use, add it to your words.`, target: misspelt[0].target, pointsLost: Math.min(10, 2 * misspelt.length), words: misspelt });
    }
    if (variantWords.length) {
      const list = variantWords.slice(0, 6).map(v => (v.suggestions[0] ? `${v.word} → ${v.suggestions[0]}` : v.word)).join(', ');
      add({ id: 'spelling.variant', category: 'clarity', level: 'fix', title: `Use ${chosen} spelling throughout`,
        detail: `Your CV is set to ${chosen} English, but ${variantWords.length === 1 ? 'one word uses' : variantWords.length + ' words use'} ${otherName} spelling: ${list}. Change ${variantWords.length === 1 ? 'it' : 'them'}, or switch the spelling setting above if you are applying ${variant === 'en-GB' ? 'in the US' : 'in the UK or Nigeria'}.`,
        target: variantWords[0].target, pointsLost: 2, words: variantWords });
    }
    spellingPoints = Math.max(0, 10 - 2 * misspelt.length - (variantWords.length ? 2 : 0));
  }
  const clarity = spellingPoints + Math.max(0, 5 - clarityList.length);

  const scaledImpact = impact * SCALE.impact, scaledWording = wording * SCALE.wording, scaledStructure = structure * SCALE.structure;
  const categories = [
    { id: 'impact' as const, title: 'Impact', earned: round1(scaledImpact), possible: 30 },
    { id: 'wording' as const, title: 'Wording', earned: round1(scaledWording), possible: 15 },
    { id: 'completeness' as const, title: 'Completeness', earned: round1(completeness), possible: 25 },
    { id: 'structure' as const, title: 'Length & structure', earned: round1(scaledStructure), possible: 15 },
    { id: 'clarity' as const, title: 'Spelling & clarity', earned: round1(clarity), possible: 15 },
  ];
  const score = Math.max(0, Math.min(100, Math.round(scaledImpact + scaledWording + completeness + scaledStructure + clarity)));
  const label: CheckLabel = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'Getting started';
  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'fix' ? -1 : 1) || b.pointsLost - a.pointsLost || a.title.localeCompare(b.title));
  return { score, label, categories, findings, spelling: spelling.status };
}
