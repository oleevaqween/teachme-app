import { describe, expect, it } from 'vitest';
import { limitedAnswer, unfinishedOutline } from './answer-intent';
import { answerAlternatives, adoptAnswerAlternative } from './answer-alternatives';
import { ensureEvidenceGuide, updateEvidenceAnswer } from './evidence-guide';
import { activeEvidenceGuide, guidedEvidenceCatalog, guidedAnswerContext, EvidenceAnswerSchema } from './evidence-schema';
import { fixture } from './test-fixture';
function example() {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: '', overview: '', requirements: [], suggestions: [], questions: [{ question: 'Can you describe your monthly reporting?', why: 'Find a relevant reporting example.' }] };
  return ensureEvidenceGuide(w);
}
describe('Helpful alternatives without fabricated experience', () => {
  it.each(['none', 'No', ' no! ', 'I dont know', "I don't know", 'I don’t know.', 'Not sure', 'N/A'])('recognizes the limited reply %s', reply => {
    expect(limitedAnswer(reply)).not.toBeNull();
  });
  it('does not treat a detailed negative answer or a word prefix as a bare no', () => {
    expect(limitedAnswer('No, but I coordinated monthly reporting.')).toBeNull();
    expect(limitedAnswer('None of the projects were cancelled.')).toBeNull();
    expect(limitedAnswer('Northern region project')).toBeNull();
  });
  it('suggests verbatim related facts without replacing the original or inventing qualifications', () => {
    const w = example(), original = structuredClone(w), answer = { ...activeEvidenceGuide(w)!.answers[0], answer: 'none' };
    const options = answerAlternatives(w, answer), recorded = options.filter(o => o.kind === 'record');
    expect(recorded.length).toBeGreaterThan(0);
    expect(recorded.some(o => o.draft.includes('Prepared monthly reports for 4 stakeholders.'))).toBe(true);
    expect(options.some(o => o.kind === 'outline')).toBe(true);
    expect(w).toEqual(original);
    expect(answer.answer).toBe('none');
  });
  it('selection is an unconfirmed draft, preserves the original reply and blocks incomplete outlines', () => {
    const w = example(), answer = { ...activeEvidenceGuide(w)!.answers[0], answer: 'I dont know', status: 'answered' as const };
    const outline = answerAlternatives(w, answer).find(o => o.kind === 'outline')!;
    const selected = adoptAnswerAlternative(answer, outline);
    expect(selected.status).toBe('draft');
    expect(selected.assistance?.originalReply).toBe('I dont know');
    expect(unfinishedOutline(selected)).toBe(true);
    expect(() => EvidenceAnswerSchema.parse({ ...selected, status: 'answered' })).toThrow('bracketed');
    const finished = { ...selected, answer: 'I prepared monthly reports for 4 stakeholders.', status: 'answered' };
    expect(EvidenceAnswerSchema.safeParse(finished).success).toBe(true);
  });
  it('keeps bare no/unknown replies as question context, not positive evidence', () => {
    let w = example(); const answer = activeEvidenceGuide(w)!.answers[0];
    w = updateEvidenceAnswer(w, { ...answer, answer: 'no', status: 'answered' });
    expect(guidedEvidenceCatalog(w)).toEqual({});
    expect(guidedAnswerContext(w)[0]).toMatchObject({ question: answer.question, reply: 'no', interpretation: 'no-positive-evidence-or-uncertain', answerSource: null });
  });
  it('never uses unfinished or unrelated draft evidence to create alternatives', () => {
    let w = example(); const answer = activeEvidenceGuide(w)!.answers[0];
    w = updateEvidenceAnswer(w, { ...answer, answer: 'Secret monthly reporting draft with 999 staff.' });
    const options = answerAlternatives(w, { ...answer, answer: 'none' });
    expect(JSON.stringify(options)).not.toContain('999');
  });
  it('does not substitute a related qualification for an unheld credential', () => {
    const w = example(), answer = { ...activeEvidenceGuide(w)!.answers[0], question: 'Do you hold a PMP qualification?', answer: 'no' };
    const options = answerAlternatives(w, answer);
    expect(options.find(o => o.kind === 'outline')?.draft).toContain('or state that none applies');
    expect(options.some(o => o.draft === 'I hold a PMP qualification.')).toBe(false);
  });
});
