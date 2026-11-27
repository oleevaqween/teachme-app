import { describe, expect, it } from 'vitest';
import { activeEvidenceGuide, EvidenceGuidesSchema, guidedEvidenceCatalog } from './evidence-schema';
import { ensureEvidenceGuide, updateEvidenceAnswer, evidenceHelp } from './evidence-guide';
import { evidenceCatalog, inputSignature, WorkspaceSchema, validateAnalysis } from './schema';
import { fixture } from './test-fixture';

function example() {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Example', overview: '', requirements: [], suggestions: [], questions: [
    { question: 'Did you lead 999 people?', why: 'Clarify your actual responsibility.' },
    { question: 'Do you hold a PMP credential?', why: 'Clarify the qualification.' },
  ] };
  w.analysisInput = inputSignature(w);
  return w;
}
describe('Guided evidence and data boundaries', () => {
  it('opens old workspaces without migrating or changing existing notes/signatures', () => {
    const w = example(), original = structuredClone(w), next = ensureEvidenceGuide(w);
    expect(w).toEqual(original);
    expect(next.evidenceNotes).toBe(w.evidenceNotes);
    expect(next.resume).toEqual(w.resume);
    expect(WorkspaceSchema.parse(w).evidenceGuides).toBeUndefined();
    expect(inputSignature(next)).toBe(inputSignature(w));
    expect(activeEvidenceGuide(next)?.answers).toHaveLength(2);
  });
  it('keeps draft and skipped text/documents out of provider evidence', () => {
    let w = ensureEvidenceGuide(example());
    const answer = activeEvidenceGuide(w)!.answers[0];
    w = updateEvidenceAnswer(w, { ...answer, answer: 'Unconfirmed 88 staff.', attachments: [{ id: 'd1', name: 'secret.txt', text: 'Unconfirmed 55 projects.' }] });
    expect(guidedEvidenceCatalog(w)).toEqual({});
    w = updateEvidenceAnswer(w, { ...activeEvidenceGuide(w)!.answers[0], status: 'skipped' });
    expect(guidedEvidenceCatalog(w)).toEqual({});
    expect(activeEvidenceGuide(w)!.answers[0].answer).toContain('88');
  });
  it('uses confirmed excerpts but never the question or filename as candidate evidence', () => {
    let w = ensureEvidenceGuide(example());
    const a = activeEvidenceGuide(w)!.answers[0];
    const previous = inputSignature(w);
    w = updateEvidenceAnswer(w, { ...a, answer: 'I coordinated 12 workshops at Example Ltd.', status: 'answered', attachments: [{ id: 'd1', name: '999 staff.txt', text: 'Coordinated 12 workshops.' }] });
    expect(inputSignature(w)).not.toBe(previous);
    expect(Object.values(evidenceCatalog(w)).join('\n')).not.toContain('999');
    expect(evidenceCatalog(w)['document.' + a.id + '.d1']).toBe('Coordinated 12 workshops.');
    const result = validateAnalysis({ ...w.analysis, suggestions: [{ id: 's1', target: 'summary', before: w.resume.summary, after: 'Coordinated 12 workshops.', reason: 'Confirmed additional detail.', status: 'pending', evidence: [{ source: 'answer.' + a.id, quote: 'I coordinated 12 workshops at Example Ltd.' }] }] }, w);
    expect(result.suggestions).toHaveLength(1);
  });
  it('preserves confirmed answers after question refresh and adds new questions only once', () => {
    let w = ensureEvidenceGuide(example());
    const a = activeEvidenceGuide(w)!.answers[0];
    w = updateEvidenceAnswer(w, { ...a, answer: 'I coordinated workshops.', status: 'answered' });
    w.analysis!.questions.push({ question: 'Which tool did you use?', why: 'Clarify tooling.' });
    w = ensureEvidenceGuide(ensureEvidenceGuide(w));
    expect(activeEvidenceGuide(w)!.answers).toHaveLength(3);
    expect(activeEvidenceGuide(w)!.answers[0].status).toBe('answered');
  });
  it('keeps a guide that only lists terms the user does not have, and still asks for preparation when it has no questions', () => {
    const w = example();
    w.analysis!.questions = [];
    w.evidenceGuides = [{ id: 'g1', jobDescription: w.jobDescription, answers: [], notHeld: ['Power BI'] }];
    expect(() => ensureEvidenceGuide(w)).toThrow('Prepare your application first.');
    const withQuestion = example();
    withQuestion.evidenceGuides = [{ id: 'g1', jobDescription: withQuestion.jobDescription, answers: [], notHeld: ['Power BI'] }];
    expect(activeEvidenceGuide(ensureEvidenceGuide(withQuestion))!.notHeld).toEqual(['Power BI']);
  });
  it('does not carry answers into a changed posting or discard old evidence', () => {
    let w = ensureEvidenceGuide(example());
    const a = activeEvidenceGuide(w)!.answers[0];
    w = updateEvidenceAnswer(w, { ...a, answer: 'Confirmed fact.', status: 'answered' });
    const original = structuredClone(w.evidenceGuides);
    w.jobDescription = 'A different posting.';
    expect(guidedEvidenceCatalog(w)).toEqual({});
    expect(() => ensureEvidenceGuide(w)).toThrow('posting changed');
    w.analysisInput = inputSignature(w);
    const next = ensureEvidenceGuide(w);
    expect(next.evidenceGuides).toHaveLength(2);
    expect(next.evidenceGuides![0]).toEqual(original![0]);
  });
  it('rejects blank confirmed answers, duplicates and oversized evidence', () => {
    const w = ensureEvidenceGuide(example()), a = activeEvidenceGuide(w)!.answers[0];
    expect(() => updateEvidenceAnswer(w, { ...a, status: 'answered' })).toThrow();
    expect(() => updateEvidenceAnswer(w, { ...a, answer: 'x'.repeat(6001) })).toThrow();
    expect(() => EvidenceGuidesSchema.parse([...w.evidenceGuides!, ...w.evidenceGuides!])).toThrow();
  });
  it('provides relevant coaching for qualifications, tools and experience', () => {
    expect(evidenceHelp('Do you have a certificate?').prompt).toContain('issuing body');
    expect(evidenceHelp('How have you used Power BI?').prompt).toContain('personally');
    expect(evidenceHelp('Tell me about a project.').prompt).toContain('where and when');
  });
});
