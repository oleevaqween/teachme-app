import { describe, expect, it, vi } from 'vitest';
import { activeEvidenceGuide } from '@/lib/cv-studio/evidence-schema';
import { inputSignature, type Workspace } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { addTermQuestion, GUIDE_FULL, markNotHeld, NOT_HELD_FULL, termLearningInput, termQuestion } from '@/lib/cv-studio/term-gaps';
import { termGapActions } from './term-gap-actions';

function analysed(): Workspace {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Acme', overview: '', requirements: [], suggestions: [], questions: [] };
  w.analysisInput = inputSignature(w);
  return w;
}

function wire(workspace: Workspace | null) {
  const change = vi.fn<(w: Workspace) => void>();
  const setError = vi.fn<(message: string) => void>();
  const openGuide = vi.fn<(answerId: string) => void>();
  const learn = vi.fn<(input: ReturnType<typeof termLearningInput>) => void>();
  return { change, setError, openGuide, learn, actions: termGapActions({ workspace, change, setError, openGuide, learn }) };
}

describe('keyword-gap controller wiring', () => {
  it('I have this adds the question through autosave and opens the guide on it', () => {
    const t = wire(analysed());
    t.actions.have('Power BI', 'essential');
    const answer = activeEvidenceGuide(t.change.mock.calls[0][0])!.answers[0];
    expect(answer.question).toBe(termQuestion('Power BI'));
    expect(t.openGuide).toHaveBeenCalledWith(answer.id);
    expect(t.setError).not.toHaveBeenCalled();
  });

  it("I don't have this yet records the term, and Undo removes it", () => {
    const t = wire(analysed());
    t.actions.lack('Power BI');
    const marked = t.change.mock.calls[0][0];
    expect(activeEvidenceGuide(marked)!.notHeld).toEqual(['Power BI']);
    const u = wire(marked);
    u.actions.undo('power bi');
    expect(activeEvidenceGuide(u.change.mock.calls[0][0])!.notHeld).toEqual([]);
  });

  it('shows the plain messages when the guide or the list is full, changing nothing', () => {
    let full = analysed();
    for (let i = 0; i < 32; i++) full = addTermQuestion(full, 'Term ' + i, 'essential').workspace;
    const t = wire(full);
    t.actions.have('Power BI', 'essential');
    expect(t.setError).toHaveBeenCalledWith(GUIDE_FULL);
    expect(t.change).not.toHaveBeenCalled();
    let marked = analysed();
    for (let i = 0; i < 40; i++) marked = markNotHeld(marked, 'Term ' + i);
    const n = wire(marked);
    n.actions.lack('Term 40');
    expect(n.setError).toHaveBeenCalledWith(NOT_HELD_FULL);
    expect(n.change).not.toHaveBeenCalled();
  });

  it('Open and Learn it pass on the right details', () => {
    const w = analysed();
    const t = wire(w);
    t.actions.open('a1');
    expect(t.openGuide).toHaveBeenCalledWith('a1');
    t.actions.learn(' Power BI ');
    expect(t.learn).toHaveBeenCalledWith(termLearningInput(w, ' Power BI '));
  });

  it('does nothing without an open CV', () => {
    const t = wire(null);
    t.actions.have('Power BI', 'essential'); t.actions.lack('Power BI'); t.actions.undo('Power BI'); t.actions.learn('Power BI');
    expect(t.change).not.toHaveBeenCalled();
    expect(t.learn).not.toHaveBeenCalled();
    expect(t.setError).not.toHaveBeenCalled();
  });
});
