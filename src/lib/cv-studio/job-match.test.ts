import { describe, expect, it } from 'vitest';
import { analysisSignature, inputSignature, type Analysis, type Workspace } from './schema';
import { analysisMatchesJob, containsTerm, jobMatch, jobMatchEstimate, verifiedKeywords } from './job-match';
import { acceptTailoredDraft, tailoredDraft, tailoringIsCurrent } from './tailoring';
import { fixture } from './test-fixture';

const keywords: NonNullable<Analysis['keywords']> = [
  { term: 'stakeholder management', importance: 'essential' },
  { term: 'monthly reporting', importance: 'essential' },
  { term: 'Power BI', importance: 'desirable' },
];
const reviewed = (): Workspace => {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Example', overview: '', requirements: [], questions: [], keywords,
    suggestions: [
      { id: 's1', target: 'summary', before: w.resume.summary, after: 'Project manager with monthly reporting experience.', status: 'pending', reason: 'Lead with relevant work.', evidence: [{ source: 'experience.e1', quote: 'Prepared monthly reports for 4 stakeholders.' }] },
      { id: 's2', target: 'skills', before: w.resume.skills, after: 'Stakeholder management, reporting', status: 'pending', reason: 'Prioritise the posting.', evidence: [{ source: 'skills', quote: w.resume.skills }] },
    ] };
  w.analysisInput = analysisSignature(w);
  return w;
};

describe('Transparent job phrase coverage', () => {
  it('combines CV-backed requirement meaning with exact job language transparently', () => {
    const w = reviewed();
    w.analysis!.requirements = [
      { requirement: 'Stakeholder management', jobQuote: 'stakeholder management', importance: 'essential', assessment: 'supported', evidence: [{ source: 'skills', quote: 'stakeholder management' }], explanation: '' },
      { requirement: 'Monthly reporting', jobQuote: 'monthly reporting', importance: 'essential', assessment: 'partial', evidence: [{ source: 'experience.e1', quote: 'Prepared monthly reports for 4 stakeholders.' }], explanation: '' },
      { requirement: 'Power BI', jobQuote: 'Power BI', importance: 'desirable', assessment: 'not-recorded', evidence: [], explanation: '' },
    ];
    expect(jobMatchEstimate(w)).toMatchObject({ score: 54, requirementScore: 60, phraseScore: 40, requirementEarned: 3, requirementPossible: 5 });
  });
  it('does not let notes, guided answers or documents inflate requirement coverage', () => {
    const w = reviewed();
    w.analysis!.requirements = [{ requirement: 'Power BI', jobQuote: 'Power BI', importance: 'desirable', assessment: 'supported', evidence: [{ source: 'notes', quote: 'Power BI' }], explanation: '' }];
    w.evidenceNotes = 'Power BI';
    expect(jobMatchEstimate(w).requirementEarned).toBe(0);
  });
  it('credits guided evidence only after its reviewed rewrite is present in the CV', () => {
    const w = reviewed();
    w.evidenceNotes = 'Built monthly reporting for executive stakeholders.';
    w.analysis!.requirements = [{ requirement: 'Monthly reporting', jobQuote: 'monthly reporting', importance: 'essential', assessment: 'supported',
      evidence: [{ source: 'notes', quote: 'Built monthly reporting for executive stakeholders.' }], explanation: '' }];
    w.analysis!.suggestions = [{ id: 'migrate', target: 'summary', before: w.resume.summary,
      after: 'Project manager who built monthly reporting for executive stakeholders.', reason: 'Add relevant confirmed evidence.',
      evidence: [{ source: 'notes', quote: 'Built monthly reporting for executive stakeholders.' }], status: 'pending' }];
    w.analysisInput = analysisSignature(w);
    expect(jobMatchEstimate(w).requirementScore).toBe(0);
    const preview = tailoredDraft(w).resume;
    expect(jobMatchEstimate(w, preview).requirementScore).toBe(100);
    const accepted = acceptTailoredDraft(w);
    expect(jobMatchEstimate(accepted).requirementScore).toBe(100);
  });
  it('does not credit a different passage merely because it came from the same note', () => {
    const w = reviewed();
    w.evidenceNotes = 'Used Power BI. Built monthly reporting for executives.';
    w.analysis!.requirements = [{ requirement: 'Power BI', jobQuote: 'Power BI', importance: 'desirable', assessment: 'supported',
      evidence: [{ source: 'notes', quote: 'Used Power BI.' }], explanation: '' }];
    w.analysis!.suggestions = [{ id: 'other', target: 'summary', before: w.resume.summary,
      after: 'Project manager who built monthly reporting for executives.', reason: 'Add relevant confirmed evidence.',
      evidence: [{ source: 'notes', quote: 'Built monthly reporting for executives.' }], status: 'pending' }];
    w.analysisInput = analysisSignature(w);
    expect(jobMatchEstimate(w, tailoredDraft(w).resume).requirementScore).toBe(0);
  });
  it('keeps CV evidence credited when an approved rewrite faithfully paraphrases the cited field', () => {
    const w = reviewed();
    w.analysis!.requirements = [{ requirement: 'Stakeholder management', jobQuote: 'stakeholder management', importance: 'essential', assessment: 'supported',
      evidence: [{ source: 'summary', quote: w.resume.summary }], explanation: '' }];
    w.analysis!.suggestions = [{ id: 'paraphrase', target: 'summary', before: w.resume.summary,
      after: 'Delivery-focused project manager supporting stakeholder teams.', reason: 'Prioritise relevant work.',
      evidence: [{ source: 'summary', quote: w.resume.summary }], status: 'pending' }];
    w.analysisInput = analysisSignature(w);
    const accepted = acceptTailoredDraft(w);
    expect(jobMatchEstimate(accepted).requirementScore).toBe(100);
  });
  it('uses a disclosed essential 2 / desirable 1 formula', () => {
    const w = fixture();
    expect(jobMatch(w.resume, w.jobDescription, keywords)).toMatchObject({ score: 40, earned: 2, possible: 5 });
    w.resume.summary += ' Monthly reporting.';
    expect(jobMatch(w.resume, w.jobDescription, keywords).score).toBe(80);
  });
  it('labels a role by the parts that are filled in, never with a stray separator', () => {
    const w = fixture();
    const base = w.resume.experience[0];
    w.resume.experience = [{ ...base, id: 'a', title: 'Analyst', company: '', achievements: 'Monthly reporting' },
      { ...base, id: 'b', title: '', company: 'Acme', achievements: 'Monthly reporting' },
      { ...base, id: 'c', title: ' ', company: '', achievements: 'Monthly reporting' }];
    w.resume.volunteering = [{ id: 'v', role: '', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: 'Monthly reporting' }];
    const term = jobMatch(w.resume, w.jobDescription, keywords).terms.find(t => t.term.toLowerCase() === 'monthly reporting')!;
    expect(term.locations).toEqual(expect.arrayContaining(['Analyst', 'Acme', 'Experience', 'Code Club']));
    for (const label of term.locations) expect(label).not.toMatch(/^\s*·|·\s*$/);
  });
  it('counts phrases once, not keyword repetition', () => {
    const w = fixture(); w.resume.skills += ', stakeholder management '.repeat(10);
    const result = jobMatch(w.resume, w.jobDescription, [...keywords, keywords[0]]);
    expect(result.score).toBe(40); expect(result.terms).toHaveLength(3);
  });
  it('checks whole terms and preserves meaningful technical punctuation', () => {
    expect(containsTerm('JavaScript and C++ with .NET', 'Java')).toBe(false);
    expect(containsTerm('JavaScript and C++ with .NET', 'C')).toBe(false);
    expect(containsTerm('C++ and C#', 'C++')).toBe(true);
    expect(containsTerm('C++ and C#', 'C#')).toBe(true);
    expect(containsTerm('Monthly\nReporting; cross-functional teams', 'monthly reporting')).toBe(true);
    expect(containsTerm('cross-functional teams', 'cross functional')).toBe(true);
    expect(containsTerm('Power Bilingual', 'Power BI')).toBe(false);
  });
  it('rejects absent, substring, numeric-only and overlong phrases', () => {
    expect(verifiedKeywords('JavaScript and SQL are tools used across the whole engineering department 123', [
      { term: 'Java', importance: 'essential' }, { term: 'SQL', importance: 'essential' },
      { term: 'Python', importance: 'essential' }, { term: '123', importance: 'essential' },
      { term: 'tools used across the whole engineering department', importance: 'essential' },
    ])).toEqual([{ term: 'SQL', importance: 'essential' }]);
  });
  it('shows no score rather than zero or perfect for an empty report', () => {
    const w = fixture(); expect(jobMatch(w.resume, w.jobDescription, []).score).toBeNull();
  });
  it('never scores evidence notes, letters, raw imports or contacts', () => {
    const w = fixture(); w.evidenceNotes = 'Power BI monthly reporting'; w.importSource = w.evidenceNotes;
    w.letterBrief = w.evidenceNotes; w.resume.personal.fullName = w.evidenceNotes;
    expect(jobMatch(w.resume, w.jobDescription, keywords).score).toBe(40);
  });
  it('reports section locations and lower coverage when content is removed', () => {
    const w = fixture();
    expect(jobMatch(w.resume, w.jobDescription, keywords).terms[0].locations).toEqual(['Skills']);
    w.resume.skills = '';
    expect(jobMatch(w.resume, w.jobDescription, keywords).score).toBe(0);
  });
  it('invalidates a job report on changed posting but not letter voice or CV wording', () => {
    const w = reviewed(); w.letterTone = 'warm'; w.resume.summary += ' Edited.';
    expect(analysisMatchesJob(w)).toBe(true);
    w.jobDescription += ' Another requirement.'; expect(analysisMatchesJob(w)).toBe(false);
    w.analysisInput = '{broken'; expect(analysisMatchesJob(w)).toBe(false);
  });
});

describe('Whole-CV preview and approval', () => {
  it('previews an improved score without mutating the saved CV or master', () => {
    const w = reviewed(), before = structuredClone(w), draft = tailoredDraft(w);
    expect(draft.edits).toHaveLength(2);
    expect(jobMatch(draft.resume, w.jobDescription, keywords).score).toBe(80);
    expect(w).toEqual(before);
  });
  it('applies all eligible edits atomically, preserving identity, dates and qualifications', () => {
    const w = reviewed(), before = structuredClone(w), next = acceptTailoredDraft(w);
    expect(next.analysis!.suggestions.every(s => s.status === 'accepted')).toBe(true);
    expect(next.resume.personal).toEqual(w.resume.personal);
    expect(next.resume.experience).toEqual(w.resume.experience);
    expect(next.resume.education).toEqual(w.resume.education);
    expect(next.resume.certifications).toBe(w.resume.certifications);
    expect(w).toEqual(before);
  });
  it('refuses to change a master', () => {
    const w = reviewed(); w.kind = 'master';
    expect(() => acceptTailoredDraft(w)).toThrow('master CV is protected');
  });
  it('excludes duplicate targets without silently choosing a winner', () => {
    const w = reviewed(); w.analysis!.suggestions.push({ ...w.analysis!.suggestions[0], id: 'other' });
    expect(tailoredDraft(w).edits.map(s => s.target)).toEqual(['skills']);
    expect(tailoredDraft(w).blocked).toBe(2);
  });
  it('does not reapply accepted or rejected changes', () => {
    const w = reviewed(); w.analysis!.suggestions[0].status = 'rejected';
    expect(tailoredDraft(w).edits.map(s => s.target)).toEqual(['skills']);
    const next = acceptTailoredDraft(w); expect(tailoredDraft(next).edits).toEqual([]);
  });
  it('blocks stale evidence, job and manually edited CVs', () => {
    for (const change of [(w: Workspace) => { w.evidenceNotes = 'Withdraw previous statement'; },
      (w: Workspace) => { w.jobDescription += ' New role'; }, (w: Workspace) => { w.resume.summary = 'My latest text'; }]) {
      const w = reviewed(); change(w); expect(tailoredDraft(w).edits).toEqual([]);
    }
  });
  it('keeps other edits usable after accepting one, with updated current score', () => {
    const w = reviewed(), first = w.analysis!.suggestions[0];
    w.resume.summary = first.after; first.status = 'accepted';
    expect(tailoringIsCurrent(w)).toBe(true);
    expect(tailoredDraft(w).edits.map(s => s.target)).toEqual(['skills']);
    expect(jobMatch(w.resume, w.jobDescription, keywords).score).toBe(80);
  });
  it('does not invalidate new analyses when letter preferences change', () => {
    const w = reviewed(), before = w.analysisInput;
    w.letterTone = 'warm'; w.letterOpening = 'employer-led'; w.letterBrief = 'My motivation';
    expect(analysisSignature(w)).toBe(before); expect(inputSignature(w)).not.toBe(before);
    expect(tailoringIsCurrent(w)).toBe(true);
  });
});

describe('job match with the extra sections', () => {
  it('finds a language keyword in Languages', () => {
    const w = fixture();
    const keywords = [{ term: 'French', importance: 'essential' as const }];
    const job = 'Fluent French is essential.';
    expect(jobMatch(w.resume, job, keywords).terms[0].locations).toEqual([]);
    const withFrench = { ...w.resume, languages: [{ id: 'l1', language: 'French', level: 'Fluent' as const }] };
    expect(jobMatch(withFrench, job, keywords).terms[0].locations).toEqual(['Languages']);
  });

  it('finds a keyword in a volunteering role', () => {
    const w = fixture();
    const keywords = [{ term: 'mentoring', importance: 'desirable' as const }];
    const job = 'Experience in mentoring is desirable.';
    const withVolunteering = { ...w.resume, volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: 'Weekly mentoring for 8 students' }] };
    expect(jobMatch(withVolunteering, job, keywords).terms[0].locations).toEqual(['Mentor · Code Club']);
  });
});
