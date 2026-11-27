import { describe, expect, it } from 'vitest';
import { applyParagraphRewrite, LETTER_CHANGED, rewriteBelongs } from './letter-rewrite';
import { fixture } from './test-fixture';
import { inputSignature, type Workspace } from './schema';

const SENT = 'Dear Hiring Manager,\n\nOld paragraph.\n\nKind regards,\nAda Okoro';
const NEW = 'Dear Hiring Manager,\n\nNew paragraph.\n\nKind regards,\nAda Okoro';
const review = [{ index: 1, evidence: [{ source: 'experience.e1', quote: 'Prepared monthly reports for 4 stakeholders.' }] }];

const ready = (): Workspace => {
  const w = fixture();
  w.package = { coverLetter: SENT, coverLetterApproved: true, interview: [], learningPriorities: [], letterStatus: 'retained', auditedLetter: 'older', letterNotice: 'A notice.', letterIssues: ['An issue.'], letterWarnings: ['Old advice.'] };
  w.packageInput = inputSignature(w);
  return w;
};
const rewriteFor = (w: Workspace, letterWarnings?: string[]) => ({
  workspaceId: w.id, packageInput: w.packageInput, sent: SENT,
  result: { ok: true as const, coverLetter: NEW, letterReview: review, paragraph: 'New paragraph.', ...(letterWarnings ? { letterWarnings } : {}) },
});

describe('applying a checked paragraph rewrite', () => {
  it('stores the new letter as an unapproved, audited draft with its review and advice', () => {
    const w = ready();
    const applied = applyParagraphRewrite(w, rewriteFor(w, ['Shorten the opening.']));
    if (!('package' in applied)) throw new Error('expected a package');
    const p = applied.package;
    expect(p.coverLetter).toBe(NEW);
    expect(p.auditedLetter).toBe(NEW);
    expect(p.letterReview).toEqual(review);
    expect(p.coverLetterApproved).toBe(false);
    expect(p.letterStatus).toBe('draft');
    expect(p).not.toHaveProperty('letterNotice');
    expect(p).not.toHaveProperty('letterIssues');
    expect(p.letterWarnings).toEqual(['Shorten the opening.']);
    expect(w.package!.coverLetter).toBe(SENT);
  });
  it('removes old advice when the rewrite has none', () => {
    const w = ready();
    for (const warnings of [undefined, []]) {
      const applied = applyParagraphRewrite(w, rewriteFor(w, warnings));
      expect('package' in applied && applied.package).not.toHaveProperty('letterWarnings');
    }
  });
  it('refuses when the letter, the workspace or the pack inputs changed since the rewrite was sent', () => {
    const w = ready();
    const changedLetter = { ...w, package: { ...w.package!, coverLetter: SENT + ' Edited.' } };
    expect(applyParagraphRewrite(changedLetter, rewriteFor(w))).toEqual({ error: LETTER_CHANGED });
    expect(applyParagraphRewrite({ ...w, id: 'another' }, rewriteFor(w))).toEqual({ error: LETTER_CHANGED });
    expect(applyParagraphRewrite({ ...w, packageInput: 'changed' }, rewriteFor(w))).toEqual({ error: LETTER_CHANGED });
    expect(applyParagraphRewrite({ ...w, package: null }, rewriteFor(w))).toEqual({ error: LETTER_CHANGED });
    expect(LETTER_CHANGED).toBe('Your letter changed while this was being written. Rewrite the paragraph again.');
  });
  it('says whether a pending rewrite still belongs to the letter on screen', () => {
    const w = ready();
    expect(rewriteBelongs(w, rewriteFor(w))).toBe(true);
    expect(rewriteBelongs({ ...w, id: 'another' }, rewriteFor(w))).toBe(false);
    expect(rewriteBelongs({ ...w, packageInput: 'changed' }, rewriteFor(w))).toBe(false);
    expect(rewriteBelongs({ ...w, package: { ...w.package!, coverLetter: NEW } }, rewriteFor(w))).toBe(false);
  });
});
