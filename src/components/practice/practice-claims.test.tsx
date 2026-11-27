import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionQuestion } from '@/lib/practice/session';
import { PracticeRow } from './ApplicationPracticeList';
import { QuestionList } from './QuestionList';
import { SaveEvidenceBox, savedMessage } from './SaveEvidenceBox';

const noop = () => {};
const saveOk = async () => true;
const claimQuestion: SessionQuestion = {
  key: 'extra:c1', text: 'How did you track the budget?', guidance: '', source: 'claim', kind: 'claim', evidence: [],
  claim: { target: 'experience.e1', bullet: 'Managed a budget of ₦2,000,000.' }, progress: { attempts: 0, best: null, latest: null },
};

describe('defending claims in Mock Interview', () => {
  it('offers the answer, the number choice and the tick, with Save disabled until ticked', () => {
    const html = renderToStaticMarkup(<SaveEvidenceBox initialAnswer="I tracked it monthly with finance." busy={false} disabled={false} onSave={saveOk} />);
    expect(html).toContain('Save as evidence');
    expect(html).toContain('I tracked it monthly with finance.');
    for (const label of ['Exact', 'Approximate', 'No number', 'This is true and I can back it up']) expect(html).toContain(label);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Save as evidence/);
  });
  it('shows the save result inside the box', () => {
    const ok = renderToStaticMarkup(<SaveEvidenceBox initialAnswer="I tracked it monthly with finance." busy={false} disabled={false} onSave={saveOk} result={{ message: 'Saved as evidence for this bullet.', error: false }} />);
    expect(ok).toContain('role="status"');
    expect(ok).toContain('Saved as evidence for this bullet.');
    const bad = renderToStaticMarkup(<SaveEvidenceBox initialAnswer="I tracked it monthly with finance." busy={false} disabled={false} onSave={saveOk} result={{ message: 'This CV was changed elsewhere. Reload this page and save again.', error: true }} />);
    expect(bad).toContain('role="alert"');
  });
  it('hints at the minimum length only while the answer is too short', () => {
    const short = renderToStaticMarkup(<SaveEvidenceBox initialAnswer="Too short" busy={false} disabled={false} onSave={saveOk} />);
    expect(short).toContain('Write at least 20 characters to save.');
    const long = renderToStaticMarkup(<SaveEvidenceBox initialAnswer="I tracked it monthly with finance and reported variances." busy={false} disabled={false} onSave={saveOk} />);
    expect(long).not.toContain('Write at least 20 characters to save.');
  });
  it('says where the evidence was saved', () => {
    expect(savedMessage({ saved: true, master: 'saved', masterNote: null })).toBe('Saved as evidence for this bullet, and on your master CV.');
    expect(savedMessage({ saved: true, master: 'none', masterNote: null })).toBe('Saved as evidence for this bullet.');
  });
  it('labels claim questions and shows a master CV hint when there are none', () => {
    const list = renderToStaticMarkup(<QuestionList questions={[claimQuestion]} selectedKey={null} onSelect={noop} onGenerate={noop} canGenerate={false} capReached={false} generating={false} disabled={false} />);
    expect(list).toContain('Claim');
    const empty = renderToStaticMarkup(<QuestionList questions={[]} selectedKey={null} onSelect={noop} onGenerate={noop} canGenerate={false} capReached={false} generating={false} disabled={false} emptyHint="Press Practise defending this in CV Studio." />);
    expect(empty).toContain('No questions yet for this CV.');
    expect(empty).toContain('Press Practise defending this in CV Studio.');
  });
  it('marks master CV rows on the interview hub', () => {
    const html = renderToStaticMarkup(<PracticeRow s={{ workspaceId: 'm1', kind: 'master', name: 'Master CV', role: 'Project Manager', company: '', practised: 0, total: 0, average: null }} />);
    expect(html).toContain('Master CV · Project Manager');
    expect(html).toContain('/interview/practice/m1');
  });
});
