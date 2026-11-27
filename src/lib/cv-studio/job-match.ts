import { evidenceCatalog, profileText, targetText, type Analysis, type Resume, type Workspace } from './schema';
import { sourceQuote } from './source-quote';
import { formatLanguage } from './sections';

type Keyword = NonNullable<Analysis['keywords']>[number];
const normalized = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[‐‑–—-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Whole phrase matching, not substrings (Java != JavaScript, C != C++).
 * Only case, whitespace and hyphenation are folded. No invented synonyms. */
export function containsTerm(text: string, term: string) {
  const haystack = normalized(text), needle = normalized(term);
  if (!needle) return false;
  let offset = haystack.indexOf(needle);
  const word = (s: string) => /[\p{L}\p{N}_+#]/u.test(s);
  while (offset >= 0) {
    if ((!offset || !word(haystack[offset - 1])) && (offset + needle.length === haystack.length || !word(haystack[offset + needle.length]))) return true;
    offset = haystack.indexOf(needle, offset + 1);
  }
  return false;
}

export function verifiedKeywords(job: string, keywords: Keyword[]): Keyword[] {
  const unique = new Map<string, Keyword>();
  for (const keyword of keywords) {
    const term = sourceQuote(job, keyword.term);
    if (!term || !containsTerm(job, term) || term.split(/\s+/).length > 6 || !/[\p{L}]/u.test(term)) continue;
    const key = normalized(term);
    const previous = unique.get(key);
    if (!previous || keyword.importance === 'essential') unique.set(key, { ...keyword, term });
  }
  return [...unique.values()];
}

export function analysisMatchesJob(w: Workspace) {
  if (!w.analysis || !w.analysisInput) return false;
  try { return JSON.parse(w.analysisInput)[1] === w.jobDescription; } catch { return false; }
}

/** A disclosed keyword coverage estimate, not a model's arbitrary score, an
 * employer ATS simulator or a qualification/hiring prediction. Notes, letter,
 * imported raw text and pending edits are deliberately excluded. */
/** "Title · Organisation" from the parts that are filled in, or the section name when both are blank. */
const roleLabel = (title: string, organisation: string, section: string) => [title.trim(), organisation.trim()].filter(Boolean).join(' · ') || section;

export function jobMatch(resume: Resume, job: string, keywords: Keyword[]) {
  const sections = [
    { label: 'Headline', text: resume.personal.professionalTitle },
    { label: 'Summary', text: resume.summary }, { label: 'Skills', text: resume.skills },
    ...resume.experience.map(e => ({ label: roleLabel(e.title, e.company, 'Experience'), text: [e.title, e.achievements].join('\n') })),
    { label: 'Education', text: resume.education.map(e => e.degree).join('\n') },
    { label: 'Certifications', text: resume.certifications }, { label: 'Projects', text: resume.projects },
    { label: 'Additional', text: resume.additional },
    ...resume.volunteering.map(v => ({ label: roleLabel(v.role, v.organisation, 'Volunteering'), text: [v.role, v.achievements].join('\n') })),
    { label: 'Languages', text: resume.languages.map(formatLanguage).join('\n') },
    { label: 'Awards & achievements', text: resume.awards }, { label: 'Training & courses', text: resume.training },
    { label: 'Publications & talks', text: resume.publications }, { label: 'Strengths', text: resume.strengths },
    { label: 'Interests', text: resume.interests }, { label: 'References', text: resume.references },
  ];
  const terms = verifiedKeywords(job, keywords).map(keyword => ({ ...keyword,
    weight: keyword.importance === 'essential' ? 2 : 1,
    locations: sections.filter(s => containsTerm(s.text, keyword.term)).map(s => s.label),
  }));
  const possible = terms.reduce((sum, term) => sum + term.weight, 0);
  const earned = terms.reduce((sum, term) => sum + (term.locations.length ? term.weight : 0), 0);
  return { score: possible ? Math.round(100 * earned / possible) : null, earned, possible, terms,
    words: profileText(resume).trim().split(/\s+/).filter(Boolean).length };
}

const cvSource = /^(?:personal|summary|skills|certifications|projects|additional|languages|awards|training|publications|strengths|interests|references|experience\.[a-zA-Z0-9_-]+|education\.[a-zA-Z0-9_-]+|volunteering\.[a-zA-Z0-9_-]+)$/;

type Citation = { source: string; quote: string };
const targetSource = (target: string) => target.endsWith('.achievements') ? target.slice(0, -'.achievements'.length) : target;
const overlap = (a: string, b: string) => {
  const left = normalized(a), right = normalized(b);
  return !!left && !!right && (left.includes(right) || right.includes(left));
};

/** Resolve a requirement citation to the actual CV. An approved rewrite may
 * faithfully paraphrase a cited field or move a guided answer into the CV, so
 * the returned citation points at the reviewed text now present in the CV. */
export function cvCitationForEvidence(w: Workspace, resume: Resume, evidence: Citation,
  catalog: Record<string, string> = evidenceCatalog({ ...w, resume })): Citation | null {
  const direct = cvSource.test(evidence.source) ? sourceQuote(catalog[evidence.source], evidence.quote) : null;
  if (direct) return { source: evidence.source, quote: direct };
  for (const suggestion of w.analysis?.suggestions ?? []) {
    const current = targetText(resume, suggestion.target);
    if (suggestion.status === 'rejected' || current !== suggestion.after) continue;
    if (targetSource(suggestion.target) === evidence.source && sourceQuote(suggestion.before, evidence.quote) !== null) {
      return { source: targetSource(suggestion.target), quote: current };
    }
    const original = sourceQuote(catalog[evidence.source], evidence.quote);
    if (!original) continue;
    const carried = suggestion.evidence.some(citation => {
      if (citation.source !== evidence.source) return false;
      const cited = sourceQuote(catalog[citation.source], citation.quote);
      return cited !== null && overlap(original, cited);
    });
    if (carried) return { source: targetSource(suggestion.target), quote: current };
  }
  return null;
}

/** Meaning carries 70% and exact posting language 30%. The meaning component
 * counts only explicit requirements supported by citations in CV fields. Notes,
 * uploads and guided answers may improve the evidence review but cannot inflate
 * this resume score until an approved edit puts the fact in the CV. */
export function jobMatchEstimate(w: Workspace, resume: Resume = w.resume) {
  const phrases = jobMatch(resume, w.jobDescription, w.analysis?.keywords ?? []);
  const catalog = evidenceCatalog({ ...w, resume });
  const explicit = (w.analysis?.requirements ?? []).filter(r => r.importance !== 'inferred');
  const verified = explicit.filter(r => r.assessment !== 'unverified');
  let requirementPossible = 0, requirementEarned = 0;
  for (const requirement of verified) {
    const weight = requirement.importance === 'essential' ? 2 : 1;
    requirementPossible += weight;
    const inCv = requirement.evidence.some(e => cvCitationForEvidence(w, resume, e, catalog) !== null);
    if (inCv && requirement.assessment === 'supported') requirementEarned += weight;
    else if (inCv && requirement.assessment === 'partial') requirementEarned += weight / 2;
  }
  const requirementScore = requirementPossible ? 100 * requirementEarned / requirementPossible : null;
  const score = requirementScore !== null && phrases.score !== null ? Math.round(requirementScore * .7 + phrases.score * .3)
    : requirementScore !== null ? Math.round(requirementScore) : phrases.score;
  return { ...phrases, score, phraseScore: phrases.score, requirementScore: requirementScore === null ? null : Math.round(requirementScore),
    requirementEarned, requirementPossible, verifiedRequirements: verified.length,
    unverifiedRequirements: explicit.length - verified.length };
}
