import type { CheckTarget } from './cv-checker';
import { cvTextFields } from './cv-text';
import type { Market, Resume } from './schema';

export const marketLabels: Record<Market, string> = { international: 'International / UK', nigeria: 'Nigeria', us: 'US' };

export function marketSpelling(market: Market): 'en-GB' | 'en-US' {
  return market === 'us' ? 'en-US' : 'en-GB';
}

/** The workspace fields a market switch sets together: the market and its spelling. */
export function marketUpdate(market: Market): { market: Market; spelling: 'en-GB' | 'en-US' } {
  return { market, spelling: marketSpelling(market) };
}

const YEAR = /\b(19[5-9]\d|20\d\d)\b/g;

/** Years since the earliest four-digit start year in Experience, or null when no start date has a year. */
export function experienceYears(resume: Resume, now: Date): number | null {
  const years = resume.experience.flatMap(e => [...e.startDate.matchAll(YEAR)].map(m => Number(m[1])));
  return years.length ? now.getFullYear() - Math.min(...years) : null;
}

/** The word count above which the CV is long for this market, and how to say the target. */
export function lengthTarget(market: Market, resume: Resume, now: Date): { long: number; advice: string } {
  const years = experienceYears(resume, now);
  if (market === 'us' && years !== null && years < 10) return { long: 550, advice: "For US roles with under 10 years' experience, aim for one page (about 300 to 550 words)" };
  return { long: 900, advice: market === 'us' ? 'For US roles, aim for about two pages (300 to 900 words)' : 'Aim for about two pages (300 to 900 words)' };
}

export type MarketAdvice = { id: string; title: string; detail: string; target: CheckTarget };

const NOT_EXPECTED = 'UK, US and most Nigerian employers do not expect it, and it can lead to unfair screening.';
// Labels and phrases only, so ordinary prose ("a single source") is never flagged.
// Colon labels must start a line (optionally after a bullet) or follow a separator or opening bracket, so "by age: 18-35" or a quoted title is not a label.
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const LABEL = String.raw`(?:^[ \t]*[-–*•]?|[|·•;,(/])\s*`;
const PERSONAL: { id: string; title: string; pattern: RegExp }[] = [
  { id: 'birth', title: 'Leave out your date of birth',
    pattern: new RegExp(String.raw`\bdate of birth\b|(?<![a-z@])d\.?o\.?b(?![a-z@])(?!\.[a-z])|\bborn(?:[ \t]+on)?(?:[ \t]+the)?[ \t]*:?[ \t]*(?:\d|${MONTH}\b)|${LABEL}age\s*:\s*\d`, 'im') },
  { id: 'marital', title: 'Leave out your marital status',
    pattern: new RegExp(String.raw`\bmarital status\b|${LABEL}status\s*:\s*(?:married|single|divorced|widowed)\b`, 'im') },
  // A colon label, or (no colon) the label followed by a typical answer: "Religion Christian", "Religion - Islam".
  { id: 'religion', title: 'Leave out your religion',
    pattern: new RegExp(String.raw`${LABEL}religion\s*(?::|[-–]?\s*(?:christian(?:ity)?|muslim|islam|catholic|protestant|anglican|methodist|pentecostal|baptist|orthodox|hindu(?:ism)?|buddhist|jewish|sikh|atheist|traditional)\b)`, 'im') },
  { id: 'origin', title: 'Leave out your state of origin',
    pattern: new RegExp(String.raw`\bstate of origin\b|${LABEL}l\.?g\.?a\.?\s*(?::|of origin)`, 'im') },
  // A colon label, or (no colon) the label followed by an answer: "Gender Male", "Sex - F".
  { id: 'gender', title: 'Leave out your gender',
    pattern: new RegExp(String.raw`${LABEL}(?:gender|sex)\s*(?::|[-–]?\s*(?:male|female|man|woman|m|f|non-binary)(?![a-z]))`, 'im') },
];
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?[\d(][\d\s().-]{5,}\d/g;
const YEAR_SPAN = /^(?:19[5-9]|20\d)\d\s*[-.]\s*(?:19[5-9]|20\d)\d$/;
const DATE_RUN = /^\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}$/;
// A run is a phone number only with 7 or more digits and when it is not two years or a dd.mm.yyyy date.
const hasPhone = (text: string) => [...text.matchAll(PHONE)].some(m => {
  const run = m[0].replace(/^[(\s]+|[)\s]+$/g, '');
  return m[0].replace(/\D/g, '').length >= 7 && !YEAR_SPAN.test(run) && !DATE_RUN.test(run);
});

/** Every place a personal detail could have been typed, with where the checker's Go to button should lead. */
function scannedText(resume: Resume): { text: string; target: CheckTarget }[] {
  const p = resume.personal;
  return [
    { text: [p.fullName, p.professionalTitle, p.email, p.phone, p.location, p.linkedin].join('\n'), target: 'profile' },
    ...cvTextFields(resume).map(f => ({ text: f.text, target: f.target })),
    { text: resume.references, target: 'references' },
  ];
}

/** Market conventions as advice only: the checker shows these at 0 points. */
export function marketAdvice(resume: Resume, market: Market, pageSize?: 'A4' | 'LETTER'): MarketAdvice[] {
  const advice: MarketAdvice[] = [];
  const fields = scannedText(resume);
  for (const item of PERSONAL) {
    const found = fields.find(f => item.pattern.test(f.text));
    if (found) advice.push({ id: 'market.personal.' + item.id, title: item.title, detail: NOT_EXPECTED, target: found.target });
  }
  const refs = resume.references;
  if (EMAIL.test(refs) || hasPhone(refs)) {
    advice.push({ id: 'market.referees', title: 'Leave referees off your CV', target: 'references',
      detail: 'Give their details when an employer asks.' + (market === 'nigeria' ? ' Most Nigerian employers will ask for two or three, so have them ready.' : '') });
  }
  if (/\bavailable\s+(?:up)?on\s+request\b/i.test(refs)) {
    advice.push({ id: 'market.on-request', title: 'Remove "References available on request"', detail: 'This line is not needed; employers assume it.', target: 'references' });
  }
  if (pageSize === 'A4' && market === 'us') advice.push({ id: 'market.paper', title: 'Use US Letter paper', detail: 'US employers expect Letter-size pages. Change it in Design.', target: 'design' });
  if (pageSize === 'LETTER' && market !== 'us') advice.push({ id: 'market.paper', title: 'Use A4 paper', detail: 'Employers outside the US expect A4 pages. Change it in Design.', target: 'design' });
  return advice;
}
