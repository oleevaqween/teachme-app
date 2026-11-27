import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CutPlan } from '@/lib/cv-studio/condense';
import { checkCv } from '@/lib/cv-studio/cv-checker';
import { fixture } from '@/lib/cv-studio/test-fixture';
import type { StudioController } from '../useStudioController';
import { CheckerPanel } from './CheckerPanel';
import { CutAction, CutPanel, cutFocusTarget } from './CutPanel';

const noop = () => {};
const plan = (extra: Partial<CutPlan> = {}): CutPlan => ({
  before: 780, after: 540, limit: 550, marketLabel: 'US', overBy: 0, nothingQualifies: false, allDismissed: false,
  proposals: [
    { id: 'experience.old', section: 'experience', entryId: 'old', label: 'Manager · Org old', dates: '2000 – 2008', before: 'x', after: '', kept: [], removed: ['Attended meetings', 'Filed papers'] },
    { id: 'experience.mid', section: 'experience', entryId: 'mid', label: 'Lead · Org mid', dates: '2009 – 2013', before: 'y', after: 'z', kept: ['Led 3 teams'], removed: ['Booked rooms'] },
  ],
  ...extra,
});

describe('cut and condense on screen', () => {
  it('announces the summary politely', () => {
    expect(renderToStaticMarkup(<CutPanel plan={plan()} busy={false} onApply={noop} onDismiss={noop} onApplyAll={noop} />)).toContain('aria-live="polite"');
  });
  it('offers Suggest cuts on applications and a hint on master CVs', () => {
    expect(renderToStaticMarkup(<CutAction kind="application" busy={false} onSuggest={noop} />)).toContain('Suggest cuts');
    const master = renderToStaticMarkup(<CutAction kind="master" busy={false} onSuggest={noop} />);
    expect(master).toContain('Cuts are suggested on application CVs; your master CV keeps everything.');
    expect(master).not.toContain('<button');
  });
  it('lists each role with kept and struck-through bullets, and Apply, Dismiss and Apply all', () => {
    const html = renderToStaticMarkup(<CutPanel plan={plan()} busy={false} onApply={noop} onDismiss={noop} onApplyAll={noop} />);
    expect(html).toContain('780 → 540 words · target 550 (US)');
    expect(html).toContain('<del>Attended meetings</del>');
    expect(html).toContain('Keeps the title, organisation and dates only.');
    expect(html).toContain('Led 3 teams');
    expect(html).toContain('aria-label="Apply cuts to Manager · Org old"');
    expect(html).toContain('aria-label="Dismiss cuts to Lead · Org mid"');
    expect(html).toContain('Apply all');
  });
  it('shows the advice when the plan cannot reach the target', () => {
    const html = renderToStaticMarkup(<CutPanel plan={plan({ proposals: [], nothingQualifies: true, after: 780 })} busy={false} onApply={noop} onDismiss={noop} onApplyAll={noop} />);
    expect(html).toContain('No older roles to trim.');
    expect(html).not.toContain('Apply all');
  });
  it('says the cuts were dismissed when every suggestion was dismissed', () => {
    const html = renderToStaticMarkup(<CutPanel plan={plan({ proposals: [], nothingQualifies: true, allDismissed: true, after: 780 })} busy={false} onApply={noop} onDismiss={noop} onApplyAll={noop} />);
    expect(html).toContain('dismissed every suggested cut');
    expect(html).toContain('Reload the page to bring the suggestions back.');
    expect(html).not.toContain('No older roles to trim.');
  });
});

describe('focus after cuts', () => {
  it('moves to the next card, else the previous, else the summary', () => {
    expect(cutFocusTarget(['a', 'b', 'c'], ['b'])).toBe('c');
    expect(cutFocusTarget(['a', 'b', 'c'], ['c'])).toBe('b');
    expect(cutFocusTarget(['a'], ['a'])).toBeNull();
  });
  it('moves to the summary after Apply all', () => {
    expect(cutFocusTarget(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeNull();
  });
});

describe('cut panel in the checker', () => {
  // Stand-in for the controller: only the fields CheckerPanel reads, cast to the full type.
  const standIn = (cuts: CutPlan | null) => ({
    setTab: noop, setMarket: noop, setSpellingVariant: noop, busy: '', spellingChecking: false, suggestCuts: noop, cuts,
    applyCuts: async () => {}, dismissCut: noop, addOwnWord: noop, askProofread: async () => {}, proofread: { ran: false, suggestions: [], dropped: 0 },
    applyProofreadFix: async () => {}, dismissProofread: noop, removeOwnWord: noop,
  }) as unknown as StudioController;
  const filler = (n: number) => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');

  it('keeps the summary on screen after the cuts clear "Your CV is long", so focus has somewhere to land', () => {
    const w = fixture();
    const check = checkCv(w.resume);
    expect(check.findings.some(f => f.id === 'structure.long')).toBe(false);
    expect(renderToStaticMarkup(<CheckerPanel c={standIn(plan({ proposals: [], before: 540, after: 540 }))} w={w} check={check} />)).toContain('540 → 540 words · target 550 (US)');
    expect(renderToStaticMarkup(<CheckerPanel c={standIn(null)} w={w} check={check} />)).not.toContain('aria-label="Suggested cuts"');
  });

  it('shows the panel once, with Suggest cuts still on the long finding', () => {
    const w = fixture();
    const long = { ...w, resume: { ...w.resume, summary: filler(1000) } };
    const check = checkCv(long.resume);
    expect(check.findings.some(f => f.id === 'structure.long')).toBe(true);
    const html = renderToStaticMarkup(<CheckerPanel c={standIn(plan())} w={long} check={check} />);
    expect(html.match(/aria-label="Suggested cuts"/g)).toHaveLength(1);
    expect(html).toContain('Suggest cuts</button>');
  });
});
