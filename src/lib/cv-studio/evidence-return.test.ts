import { describe, expect, it, vi } from 'vitest';
import { activeEvidenceGuide } from './evidence-schema';
import { addEvidenceFor, evidenceOutcome, readEvidenceReturn, searchWithoutEvidence } from './evidence-return';
import { analysisSignature, type Analysis, type Workspace } from './schema';
import { addTermQuestion, GUIDE_FULL, markNotHeld, termGapStatus, termQuestion } from './term-gaps';
import { fixture } from './test-fixture';
import { termGapActions } from '@/components/cv-studio/term-gap-actions';

const keywords: NonNullable<Analysis['keywords']> = [
  { term: 'stakeholder management', importance: 'essential' },
  { term: 'Power BI', importance: 'desirable' },
];

/** The fixture CV analysed against its posting: "Power BI" is in the advert but not in the CV. */
function analysed(): Workspace {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Acme', overview: '', requirements: [], suggestions: [], questions: [], keywords };
  w.analysisInput = analysisSignature(w);
  return w;
}

describe('reading the evidence link', () => {
  it('reads the application and the topic', () => {
    expect(readEvidenceReturn('?open=app-1&evidence=Power+BI')).toEqual({ applicationId: 'app-1', topic: 'Power BI' });
    expect(readEvidenceReturn('?open=app-1&evidence=Power%20BI%20%26%20DAX')).toEqual({ applicationId: 'app-1', topic: 'Power BI & DAX' });
  });

  it('needs both a topic and an application', () => {
    expect(readEvidenceReturn('?open=app-1')).toBeNull();
    expect(readEvidenceReturn('?evidence=Power+BI')).toBeNull();
    expect(readEvidenceReturn('?open=app-1&evidence=++')).toBeNull();
    expect(readEvidenceReturn('')).toBeNull();
  });

  it('removes only the evidence parameter', () => {
    expect(searchWithoutEvidence('?open=app-1&evidence=Power+BI')).toBe('?open=app-1');
    expect(searchWithoutEvidence('?evidence=Power+BI')).toBe('');
  });
});

describe('what Add evidence does', () => {
  it('uses "I have this" for a missing keyword of the current analysis, matching case', () => {
    expect(evidenceOutcome(analysed(), 'power bi')).toEqual({ kind: 'have', term: 'Power BI', importance: 'desirable' });
  });

  it('opens the guide at the question the topic already has', () => {
    const { workspace, answerId } = addTermQuestion(analysed(), 'Power BI', 'desirable');
    expect(evidenceOutcome(workspace, 'Power BI')).toEqual({ kind: 'open-question', answerId });
  });

  it('opens the evidence guide for anything else', () => {
    expect(evidenceOutcome(analysed(), 'Stakeholder management')).toEqual({ kind: 'open-guide' });
    expect(evidenceOutcome(analysed(), 'Kubernetes')).toEqual({ kind: 'open-guide' });
    const stale = analysed();
    stale.jobDescription += ' SQL is a plus.';
    expect(evidenceOutcome(stale, 'Power BI')).toEqual({ kind: 'open-guide' });
  });

  it('changes nothing while working out the outcome', () => {
    const w = analysed();
    const before = structuredClone(w);
    evidenceOutcome(w, 'Power BI');
    expect(w).toEqual(before);
  });
});

describe('pressing Add evidence', () => {
  function wire() {
    const deps = {
      change: vi.fn<(next: Workspace) => void>(),
      setError: vi.fn<(message: string) => void>(),
      openQuestion: vi.fn<(answerId: string) => void>(),
      openGuide: vi.fn<() => void>(),
      done: vi.fn<() => void>(),
    };
    return deps;
  }

  it('does what "I have this" does for a missing keyword that was not marked, in one change', () => {
    const w = analysed();
    const deps = wire();
    const viaIHaveThis = vi.fn<(next: Workspace) => void>();
    termGapActions({ workspace: w, change: viaIHaveThis, setError: vi.fn(), openGuide: vi.fn(), learn: vi.fn() }).have('Power BI', 'desirable');
    addEvidenceFor(w, 'Power BI', deps);
    expect(deps.change).toHaveBeenCalledTimes(1);
    const ours = activeEvidenceGuide(deps.change.mock.calls[0][0])!;
    const theirs = activeEvidenceGuide(viaIHaveThis.mock.calls[0][0])!;
    expect(ours.answers.map(({ question, why, status }) => ({ question, why, status }))).toEqual(theirs.answers.map(({ question, why, status }) => ({ question, why, status })));
    expect(ours.answers.map((a) => a.question)).toEqual([termQuestion('Power BI')]);
    expect(ours.notHeld).toEqual(theirs.notHeld);
    expect(deps.openQuestion).toHaveBeenCalledWith(ours.answers[0].id);
    expect(deps.setError).not.toHaveBeenCalled();
    expect(deps.done).toHaveBeenCalledTimes(1);
  });

  it("adds the question and clears an earlier \"I don't have this yet\" mark in the same single change", () => {
    const marked = markNotHeld(markNotHeld(analysed(), 'Power BI'), 'SQL');
    expect(termGapStatus(marked, 'Power BI')).toEqual({ kind: 'not-held' });
    const deps = wire();
    addEvidenceFor(marked, 'Power BI', deps);
    expect(deps.change).toHaveBeenCalledTimes(1);
    const next = deps.change.mock.calls[0][0];
    const guide = activeEvidenceGuide(next)!;
    expect(guide.notHeld).toEqual(['SQL']);
    expect(guide.answers.map((a) => a.question)).toEqual([termQuestion('Power BI')]);
    expect(termGapStatus(next, 'Power BI')).toEqual({ kind: 'waiting', answerId: guide.answers[0].id });
    expect(deps.openQuestion).toHaveBeenCalledWith(guide.answers[0].id);
  });

  it('shows the plain message, changes nothing and keeps the banner when the guide is full', () => {
    let full = analysed();
    for (let i = 0; i < 32; i++) full = addTermQuestion(full, 'Term ' + i, 'essential').workspace;
    const deps = wire();
    addEvidenceFor(markNotHeld(full, 'Power BI'), 'Power BI', deps);
    expect(deps.setError).toHaveBeenCalledWith(GUIDE_FULL);
    expect(deps.change).not.toHaveBeenCalled();
    expect(deps.openQuestion).not.toHaveBeenCalled();
    // the banner stays, so the learner can press the button again after making room
    expect(deps.done).not.toHaveBeenCalled();
  });

  it('only opens the guide, writing nothing, when the question exists or the topic is not a missing keyword', () => {
    const { workspace, answerId } = addTermQuestion(analysed(), 'Power BI', 'desirable');
    const t = wire();
    addEvidenceFor(workspace, 'Power BI', t);
    expect(t.openQuestion).toHaveBeenCalledWith(answerId);
    const u = wire();
    addEvidenceFor(analysed(), 'Kubernetes', u);
    expect(u.openGuide).toHaveBeenCalledTimes(1);
    expect(t.change).not.toHaveBeenCalled();
    expect(u.change).not.toHaveBeenCalled();
    expect(t.done).toHaveBeenCalledTimes(1);
    expect(u.done).toHaveBeenCalledTimes(1);
  });
});
