import { cvCitationForEvidence, verifiedKeywords } from './job-match';
import { sourceQuote } from './source-quote';
import { evidenceCatalog, type Analysis, type Workspace } from './schema';

export type JobRubric = {
  requirements: Array<Pick<Analysis['requirements'][number], 'requirement' | 'jobQuote' | 'importance'>>;
  keywords: NonNullable<Analysis['keywords']>;
};

/** Keep only employer requirements and phrases that remain traceable to this
 * exact posting. Candidate evidence and assessments are deliberately omitted. */
export function jobRubric(job: string, analysis: Analysis | null | undefined): JobRubric | null {
  if (!analysis) return null;
  const requirements: JobRubric['requirements'] = [];
  for (const item of analysis.requirements) {
    if (item.importance === 'inferred') {
      requirements.push({ requirement: item.requirement, jobQuote: '', importance: item.importance });
      continue;
    }
    const quote = sourceQuote(job, item.jobQuote);
    if (quote) requirements.push({ requirement: item.requirement, jobQuote: quote, importance: item.importance });
  }
  const keywords = verifiedKeywords(job, analysis.keywords ?? []);
  return requirements.length || keywords.length ? { requirements, keywords } : null;
}

/** Refreshing an unchanged posting may update evidence assessments and edits,
 * but it must not silently replace the yardstick used for the score. */
export function stabilizeJobRubric(job: string, previous: Analysis, candidate: Analysis, workspace?: Workspace): Analysis {
  const rubric = jobRubric(job, previous);
  if (!rubric) return candidate;
  const catalog = workspace ? evidenceCatalog(workspace) : null;
  const unused = new Set(candidate.requirements.map((_item, index) => index));
  const requirements = rubric.requirements.map(stable => {
    const index = candidate.requirements.findIndex((item, candidateIndex) => unused.has(candidateIndex) &&
      (item.requirement === stable.requirement || (!!stable.jobQuote && sourceQuote(stable.jobQuote, item.jobQuote) !== null)));
    const prior = previous.requirements.find(item => item.requirement === stable.requirement && item.importance === stable.importance);
    const carried = workspace && catalog && prior ? prior.evidence.flatMap(evidence => {
      const citation = cvCitationForEvidence(workspace, workspace.resume, evidence, catalog);
      return citation ? [citation] : [];
    }) : [];
    if (index < 0) return carried.length && prior && (prior.assessment === 'supported' || prior.assessment === 'partial')
      ? { ...stable, assessment: prior.assessment, evidence: carried, explanation: prior.explanation }
      : { ...stable, assessment: 'not-recorded' as const, evidence: [],
        explanation: 'This refresh returned no traceable candidate evidence for the existing job requirement.' };
    unused.delete(index);
    const assessed = candidate.requirements[index];
    const candidateRank = assessed.assessment === 'supported' ? 2 : assessed.assessment === 'partial' ? 1 : 0;
    const priorRank = prior?.assessment === 'supported' ? 2 : prior?.assessment === 'partial' ? 1 : 0;
    const usePrior = carried.length > 0 && prior && priorRank > candidateRank;
    const evidence = [...(usePrior ? carried : assessed.evidence), ...(!usePrior ? carried : [])]
      .filter((item, citationIndex, all) => all.findIndex(other => other.source === item.source && other.quote === item.quote) === citationIndex);
    return { ...assessed, ...stable, ...(usePrior ? { assessment: prior.assessment, explanation: prior.explanation } : {}), evidence };
  });
  return { ...candidate, requirements,
    keywords: rubric.keywords.length ? rubric.keywords : verifiedKeywords(job, candidate.keywords ?? []) };
}
