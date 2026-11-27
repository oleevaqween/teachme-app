import { describe, expect, it } from 'vitest';
import { jobRubric, stabilizeJobRubric } from './job-rubric';
import type { Analysis } from './schema';
import { fixture } from './test-fixture';

const analysis = (requirements: Analysis['requirements'], keywords: NonNullable<Analysis['keywords']>): Analysis => ({
  role: 'Project Manager', company: 'Example', overview: '', requirements, keywords, questions: [], suggestions: [], sectionReview: [],
});

describe('Stable job rubric', () => {
  it('keeps the same verified requirements, order, weights and phrases on refresh', () => {
    const job = 'Stakeholder management is essential. Power BI is desirable.';
    const previous = analysis([
      { requirement: 'Manage stakeholders', jobQuote: 'Stakeholder management', importance: 'essential', assessment: 'supported', evidence: [], explanation: '' },
      { requirement: 'Use Power BI', jobQuote: 'Power BI', importance: 'desirable', assessment: 'not-recorded', evidence: [], explanation: '' },
    ], [{ term: 'Stakeholder management', importance: 'essential' }, { term: 'Power BI', importance: 'desirable' }]);
    const candidate = analysis([
      { requirement: 'Use Power BI', jobQuote: 'Power BI', importance: 'essential', assessment: 'supported', evidence: [{ source: 'skills', quote: 'Power BI' }], explanation: 'Now recorded.' },
      { requirement: 'Manage stakeholders', jobQuote: 'Stakeholder management', importance: 'desirable', assessment: 'partial', evidence: [{ source: 'skills', quote: 'stakeholder' }], explanation: 'Partial.' },
      { requirement: 'A new model-created item', jobQuote: 'essential', importance: 'essential', assessment: 'not-recorded', evidence: [], explanation: '' },
    ], [{ term: 'Power BI', importance: 'essential' }]);
    const result = stabilizeJobRubric(job, previous, candidate);
    expect(result.requirements.map(item => [item.requirement, item.importance, item.assessment])).toEqual([
      ['Manage stakeholders', 'essential', 'partial'], ['Use Power BI', 'desirable', 'supported'],
    ]);
    expect(result.keywords).toEqual(previous.keywords);
  });
  it('uses not-recorded rather than changing the rubric when reassessment omits an item', () => {
    const job = 'Stakeholder management is essential.';
    const previous = analysis([{ requirement: 'Manage stakeholders', jobQuote: 'Stakeholder management', importance: 'essential', assessment: 'supported', evidence: [], explanation: '' }],
      [{ term: 'Stakeholder management', importance: 'essential' }]);
    const result = stabilizeJobRubric(job, previous, analysis([], []));
    expect(result.requirements[0]).toMatchObject({ requirement: 'Manage stakeholders', importance: 'essential', assessment: 'not-recorded', evidence: [] });
  });
  it('does not freeze a supposed explicit requirement that is absent from the posting', () => {
    const previous = analysis([{ requirement: 'Aviation licence', jobQuote: 'aviation licence', importance: 'essential', assessment: 'unverified', evidence: [], explanation: '' }], []);
    expect(jobRubric('Stakeholder management is essential.', previous)).toBeNull();
  });
  it('carries accepted guided evidence into a direct CV citation on refresh', () => {
    const w = fixture();
    w.evidenceNotes = 'Built monthly reporting for executive stakeholders.';
    const after = 'Project manager who built monthly reporting for executive stakeholders.';
    const previous = analysis([{ requirement: 'Monthly reporting', jobQuote: 'monthly reporting', importance: 'essential', assessment: 'supported',
      evidence: [{ source: 'notes', quote: w.evidenceNotes }], explanation: 'Direct experience.' }],
    [{ term: 'monthly reporting', importance: 'essential' }]);
    previous.suggestions = [{ id: 'accepted', target: 'summary', before: w.resume.summary, after, reason: 'Use confirmed evidence.',
      evidence: [{ source: 'notes', quote: w.evidenceNotes }], status: 'accepted' }];
    w.resume.summary = after; w.analysis = previous;
    const candidate = analysis([{ requirement: 'Monthly reporting', jobQuote: 'monthly reporting', importance: 'essential', assessment: 'not-recorded',
      evidence: [], explanation: 'No evidence returned.' }], []);
    expect(stabilizeJobRubric(w.jobDescription, previous, candidate, w).requirements[0]).toMatchObject({
      assessment: 'supported', evidence: [{ source: 'summary', quote: after }],
    });
  });
});
