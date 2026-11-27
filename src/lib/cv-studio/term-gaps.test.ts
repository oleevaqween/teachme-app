import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { activeEvidenceGuide, EvidenceGuidesSchema } from './evidence-schema';
import { ensureEvidenceGuide, guideStartStep, updateEvidenceAnswer } from './evidence-guide';
import { inputSignature, type Workspace } from './schema';
import { fixture } from './test-fixture';
import { addTermQuestion, GUIDE_FULL, markNotHeld, NOT_HELD_FULL, errorMessage, termGapStatus, termLearningInput, termQuestion, termWhy, unmarkNotHeld } from './term-gaps';

function analysed(questions: { question: string; why: string }[] = []): Workspace {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Acme', overview: '', requirements: [], suggestions: [], questions };
  w.analysisInput = inputSignature(w);
  return w;
}

describe('term questions', () => {
  it('uses the fixed wording and reason', () => {
    expect(termQuestion('Power BI')).toBe('Have you used or done Power BI? If so, where, what did you personally do with it, and what came of it?');
    expect(termWhy('Power BI', 'essential')).toBe('The job advert lists Power BI as must-have, and your CV does not mention it. Answer only if it is true; TeachMe will not add it for you.');
    expect(termWhy('SQL', 'desirable')).toContain('as nice to have,');
  });

  it('adds the question once, as a draft, even when the analysis had no questions', () => {
    const first = addTermQuestion(analysed(), 'Power BI', 'desirable');
    const guide = activeEvidenceGuide(first.workspace)!;
    expect(guide.answers).toEqual([{ id: first.answerId, question: termQuestion('Power BI'), why: termWhy('Power BI', 'desirable'), answer: '', status: 'draft', attachments: [] }]);
    const again = addTermQuestion(first.workspace, 'Power BI', 'desirable');
    expect(again.answerId).toBe(first.answerId);
    expect(activeEvidenceGuide(again.workspace)!.answers).toHaveLength(1);
  });

  it('keeps the analysis questions and adds the term question after them', () => {
    const w = analysed([{ question: 'Do you hold a PMP credential?', why: 'Clarify the qualification.' }]);
    const { workspace } = addTermQuestion(w, 'Power BI', 'essential');
    expect(activeEvidenceGuide(workspace)!.answers.map(a => a.question)).toEqual(['Do you hold a PMP credential?', termQuestion('Power BI')]);
  });

  it('refuses a new question when the guide already has 32', () => {
    const full = analysed(Array.from({ length: 32 }, (_, i) => ({ question: 'Question ' + i + '?', why: '' })));
    expect(() => addTermQuestion(full, 'Power BI', 'essential')).toThrow(GUIDE_FULL);
  });

  it('refuses when the posting changed since the analysis', () => {
    const w = analysed();
    w.jobDescription = 'A different posting.';
    expect(() => addTermQuestion(w, 'Power BI', 'essential')).toThrow('The posting changed.');
  });
});

describe("terms you don't have yet", () => {
  it('records, ignores case-insensitive duplicates, and undoes', () => {
    let w = markNotHeld(analysed(), 'Power BI');
    w = markNotHeld(w, 'power bi');
    expect(activeEvidenceGuide(w)!.notHeld).toEqual(['Power BI']);
    expect(termGapStatus(w, 'POWER BI')).toEqual({ kind: 'not-held' });
    w = unmarkNotHeld(w, 'power BI');
    expect(activeEvidenceGuide(w)!.notHeld).toEqual([]);
    expect(termGapStatus(w, 'Power BI')).toEqual({ kind: 'open' });
  });

  it('stops at 40 terms', () => {
    let w = analysed();
    for (let i = 0; i < 40; i++) w = markNotHeld(w, 'Term ' + i);
    expect(() => markNotHeld(w, 'Term 40')).toThrow(NOT_HELD_FULL);
  });

  it('leaves a CV without a guide unchanged on undo', () => {
    const w = analysed();
    expect(unmarkNotHeld(w, 'Power BI')).toBe(w);
  });

  it('rejects stored lists that break the limits', () => {
    const guide = { id: 'g1', jobDescription: 'Job', answers: [] };
    expect(EvidenceGuidesSchema.safeParse([{ ...guide, notHeld: ['A', 'a'] }]).success).toBe(false);
    expect(EvidenceGuidesSchema.safeParse([{ ...guide, notHeld: Array.from({ length: 41 }, (_, i) => 'T' + i) }]).success).toBe(false);
    expect(EvidenceGuidesSchema.safeParse([{ ...guide, notHeld: ['x'.repeat(201)] }]).success).toBe(false);
    expect(EvidenceGuidesSchema.safeParse([guide]).success).toBe(true);
  });
});

describe('term status', () => {
  it('follows the question through waiting, answered and skipped, with not-held taking precedence', () => {
    const { workspace, answerId } = addTermQuestion(analysed(), 'Power BI', 'essential');
    expect(termGapStatus(workspace, 'Power BI')).toEqual({ kind: 'waiting', answerId });
    const answer = activeEvidenceGuide(workspace)!.answers[0];
    const answered = updateEvidenceAnswer(workspace, { ...answer, answer: 'I built the monthly dashboard in Power BI at Example Ltd.', status: 'answered' });
    expect(termGapStatus(answered, 'Power BI')).toEqual({ kind: 'answered', answerId });
    const skipped = updateEvidenceAnswer(workspace, { ...answer, status: 'skipped' });
    expect(termGapStatus(skipped, 'Power BI')).toEqual({ kind: 'skipped', answerId });
    expect(termGapStatus(markNotHeld(skipped, 'Power BI'), 'Power BI')).toEqual({ kind: 'not-held' });
  });

  it('builds the learning hand-off input', () => {
    expect(termLearningInput(analysed(), ' Power BI ')).toEqual({
      topic: 'Power BI', exercise: 'Build real experience with Power BI that you could describe in an interview.',
      role: 'Project Manager', company: 'Acme', applicationId: 'fixture',
    });
  });
});

describe('opening the guide on a question', () => {
  it('starts at the given question, otherwise at the first draft', () => {
    const w = analysed([{ question: 'First?', why: '' }, { question: 'Second?', why: '' }]);
    const guide = activeEvidenceGuide(ensureEvidenceGuide(w))!;
    expect(guideStartStep(guide)).toBe(0);
    expect(guideStartStep(guide, guide.answers[1].id)).toBe(1);
    expect(guideStartStep(guide, 'missing')).toBe(0);
  });
});

describe('case-insensitive term questions', () => {
  it('finds the status for a different-case term', () => {
    const asked = addTermQuestion(analysed(), 'Power BI', 'desirable');
    expect(termGapStatus(asked.workspace, 'power bi')).toEqual({ kind: 'waiting', answerId: asked.answerId });
  });
  it('reuses the existing question for a different-case term', () => {
    const asked = addTermQuestion(analysed(), 'Power BI', 'desirable');
    const again = addTermQuestion(asked.workspace, 'power bi', 'desirable');
    expect(again.answerId).toBe(asked.answerId);
    expect(activeEvidenceGuide(again.workspace)!.answers).toHaveLength(1);
  });
});

describe('errorMessage', () => {
  it('uses the first zod issue message, then Error.message, then the fallback', () => {
    const bad = EvidenceGuidesSchema.safeParse(42);
    expect(bad.success).toBe(false);
    const zodError = (bad as { error: unknown }).error;
    const msg = errorMessage(zodError, 'fallback');
    expect(msg).toBe((zodError as { issues: { message: string }[] }).issues[0].message);
    expect(msg.startsWith('[')).toBe(false);
    expect(errorMessage(new Error('plain'), 'fallback')).toBe('plain');
    expect(errorMessage('nope', 'fallback')).toBe('fallback');
  });
});

describe('a guide at the 32-question limit', () => {
  // 30 term questions, then a refreshed analysis brings 4 new questions; only 2 fit.
  function fullAfterRefresh(): Workspace {
    let w = analysed();
    for (let i = 0; i < 30; i++) w = addTermQuestion(w, 'Term ' + i, 'essential').workspace;
    return { ...w, analysis: { ...w.analysis!, questions: Array.from({ length: 4 }, (_, i) => ({ question: 'New question ' + i + '?', why: '' })) } };
  }

  it('keeps existing questions and adds analysis questions only up to 32', () => {
    const answers = activeEvidenceGuide(ensureEvidenceGuide(fullAfterRefresh()))!.answers;
    expect(answers).toHaveLength(32);
    expect(answers.slice(0, 30).map(a => a.question)).toEqual(Array.from({ length: 30 }, (_, i) => termQuestion('Term ' + i)));
    expect(answers.slice(30).map(a => a.question)).toEqual(['New question 0?', 'New question 1?']);
  });

  it('still records a term the user does not have yet, and refuses a new question plainly', () => {
    const w = fullAfterRefresh();
    expect(activeEvidenceGuide(markNotHeld(w, 'Power BI'))!.notHeld).toEqual(['Power BI']);
    expect(() => addTermQuestion(w, 'Power BI', 'essential')).toThrow(GUIDE_FULL);
  });

  it('shows the full-guide message instead of a raw limit error', () => {
    const answer = (i: number) => ({ id: 'a' + i, question: 'Q' + i + '?', why: '', answer: '', status: 'draft', attachments: [] });
    const over = EvidenceGuidesSchema.safeParse([{ id: 'g1', jobDescription: 'Job', answers: Array.from({ length: 33 }, (_, i) => answer(i)) }]);
    expect(over.success).toBe(false);
    expect(errorMessage((over as { error: unknown }).error, 'fallback')).toBe(GUIDE_FULL);
  });

  it('shows the full-guide message when the guides are checked inside a workspace', () => {
    const answer = (i: number) => ({ id: 'a' + i, question: 'Q' + i + '?', why: '', answer: '', status: 'draft', attachments: [] });
    const over = z.object({ evidenceGuides: EvidenceGuidesSchema }).safeParse({ evidenceGuides: [{ id: 'g1', jobDescription: 'Job', answers: Array.from({ length: 33 }, (_, i) => answer(i)) }] });
    expect(over.success).toBe(false);
    expect(errorMessage((over as { error: unknown }).error, 'fallback')).toBe(GUIDE_FULL);
  });

  it('does not map a too-big list of Improve answers to the full-guide message', () => {
    const improve = z.object({ improve: z.object({ answers: z.array(z.string()).max(1) }) }).safeParse({ improve: { answers: ['a', 'b'] } });
    expect(improve.success).toBe(false);
    expect(errorMessage((improve as { error: unknown }).error, 'fallback')).not.toBe(GUIDE_FULL);
  });

  it('does not map a too-big answers list outside an evidence guide to the full-guide message', () => {
    const other = z.object({ answers: z.array(z.string()).max(1) }).safeParse({ answers: ['a', 'b'] });
    expect(other.success).toBe(false);
    expect(errorMessage((other as { error: unknown }).error, 'fallback')).not.toBe(GUIDE_FULL);
  });
});
