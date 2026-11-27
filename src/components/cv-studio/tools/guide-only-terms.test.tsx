import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { activeEvidenceGuide } from '@/lib/cv-studio/evidence-schema';
import { markNotHeld } from '@/lib/cv-studio/term-gaps';
import { inputSignature } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import type { StudioController } from '../useStudioController';
import { EvidencePanel } from './EvidencePanel';
import { ReviewPanel } from './ReviewPanel';

// A guide that holds only "don't have yet" terms: no questions to continue.
function termOnly() {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Acme', overview: '', requirements: [], suggestions: [], questions: [] };
  w.analysisInput = inputSignature(w);
  const marked = markNotHeld(w, 'Power BI');
  const guide = activeEvidenceGuide(marked)!;
  expect(guide.answers).toEqual([]);
  expect(guide.notHeld).toEqual(['Power BI']);
  return { w: marked, guide };
}

// Stand-in for the controller: only the fields these panels read, cast to the full type.
const standIn = (guide: unknown) => ({
  update: () => {}, guide, openEvidence: () => { throw new Error('Prepare your application first'); },
  freshAnalysis: true, draft: undefined, showTailored: false, setShowTailored: () => {}, applyDraft: async () => {},
  pending: 0, decide: async () => {}, prepare: async () => {}, setTab: () => {}, spelling: undefined,
}) as unknown as StudioController;

describe('guide holding only terms the user does not have yet', () => {
  it('does not offer guided evidence in the evidence panel', () => {
    const { w, guide } = termOnly();
    const html = renderToStaticMarkup(<EvidencePanel c={standIn(guide)} w={w} />);
    expect(html).not.toContain('Continue guided evidence');
    expect(html).not.toContain('confirmed');
    expect(html).toContain('Prepare your application first');
  });
  it('does not show the questions block in the review panel', () => {
    const { w, guide } = termOnly();
    const html = renderToStaticMarkup(<ReviewPanel c={standIn(guide)} w={w} />);
    expect(html).not.toContain('A few details could make this stronger');
  });
});
