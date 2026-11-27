import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { analysisSignature, type Suggestion, type Workspace } from '@/lib/cv-studio/schema';
import { tailoredDraft } from '@/lib/cv-studio/tailoring';
import { fixture } from '@/lib/cv-studio/test-fixture';
import type { StudioController } from '../useStudioController';
import { ReviewPanel } from './ReviewPanel';

// Fixture fields: summary "Project manager supporting delivery teams.", skills "Reporting, stakeholder management", projects "".
const skills = (w: Workspace): Suggestion => ({ id: 'skills', target: 'skills', before: w.resume.skills, after: 'Stakeholder management, reporting',
  reason: 'Put the posting first.', status: 'pending', evidence: [{ source: 'skills', quote: w.resume.skills }] });
const summary = (w: Workspace): Suggestion => ({ id: 'summary', target: 'summary', before: w.resume.summary, after: 'Project manager who led delivery teams.',
  reason: 'Lead with delivery.', status: 'pending', evidence: [{ source: 'summary', quote: w.resume.summary }] });
const projects = (): Suggestion => ({ id: 'projects', target: 'projects', before: '', after: 'Led the monthly reporting project.',
  reason: 'Show the reporting work.', status: 'pending', evidence: [{ source: 'notes', quote: 'Helped with the monthly reporting project.' }] });

const reviewed = (...make: ((w: Workspace) => Suggestion)[]): Workspace => {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Example', overview: '', requirements: [], questions: [], suggestions: make.map(m => m(w)) };
  w.analysisInput = analysisSignature(w);
  return w;
};
// Stand-in for the controller: only the fields the Review panel reads, cast to the full type.
const standIn = (w: Workspace) => ({
  freshAnalysis: true, openEvidence: () => {}, draft: tailoredDraft(w), showTailored: true, setShowTailored: () => {}, applyDraft: async () => {},
  pending: w.analysis?.suggestions.filter(s => s.status === 'pending').length ?? 0, decide: async () => {}, prepare: async () => {}, setTab: () => {},
  guide: undefined, spelling: undefined,
}) as unknown as StudioController;
const render = (w: Workspace) => renderToStaticMarkup(<ReviewPanel c={standIn(w)} w={w} />);

describe('Review tab edit check', () => {
  it('shows the changes word by word, with hidden removed and added text', () => {
    const html = render(reviewed(summary));
    expect(html).toContain('<small>Changes</small>');
    expect(html).toContain('<p>Project manager <del><span class="sr-only">removed: </span>supporting</del> <ins><span class="sr-only">added: </span>who led</ins> delivery teams.</p>');
    // The Changes line sits between BEFORE and SUGGESTED.
    expect(html.indexOf('BEFORE')).toBeLessThan(html.indexOf('<small>Changes</small>'));
    expect(html.indexOf('<small>Changes</small>')).toBeLessThan(html.indexOf('SUGGESTED'));
  });
  it('keeps line breaks in the changes', () => {
    const w = reviewed();
    w.analysis!.suggestions = [{ id: 'e1', target: 'experience.e1.achievements', before: w.resume.experience[0].achievements,
      after: 'Managed a budget of ₦2,000,000.\nPrepared monthly reports for 4 stakeholders and the board.', reason: 'Add the audience.', status: 'pending',
      evidence: [{ source: 'experience.e1', quote: w.resume.experience[0].achievements }] }];
    expect(render(w)).toContain('<p>Managed a budget of ₦2,000,000.<br/>Prepared monthly reports for 4 <del><span class="sr-only">removed: </span>stakeholders.</del> <ins><span class="sr-only">added: </span>stakeholders and the board.</ins></p>');
  });
  it('lists the fixed-rule warnings under "Check this change" only when a rule fires', () => {
    const html = render(reviewed(summary));
    expect(html).toContain('<div class="edit-check"><strong>Check this change</strong><ul><li>Claims more ownership: the original says &quot;supporting&quot;, the suggestion says &quot;led&quot;. Check this is accurate.</li></ul></div>');
    // Above the actions.
    expect(html.indexOf('Check this change')).toBeLessThan(html.indexOf('Accept edit'));
    expect(render(reviewed(skills))).not.toContain('Check this change');
  });
  it('leaves flagged edits out of Apply all and says so (plural)', () => {
    const html = render(reviewed(skills, summary, projects));
    expect(html).toContain('Apply all 1 reviewed edits');
    expect(html).toContain('2 flagged edits were left out. Accept each one on its own after checking it.');
  });
  it('uses the singular note for one flagged edit', () => {
    const html = render(reviewed(skills, summary));
    expect(html).toContain('1 flagged edit was left out. Accept it on its own after checking it.');
    expect(html).not.toContain('flagged edits were left out');
  });
  it('shows no note when nothing is flagged', () => {
    expect(render(reviewed(skills))).not.toContain('flagged edit');
  });
  it('shows the plain before and suggested text with "Change check unavailable." when the check fails', () => {
    const w = reviewed(skills, () => ({ ...projects(), after: undefined as unknown as string }));
    const html = render(w);
    expect(html).toContain('Change check unavailable.');
    expect(html.match(/<small>Changes<\/small>/g)).toHaveLength(1);
    expect(html).toContain('1 flagged edit was left out. Accept it on its own after checking it.');
    expect(html).toContain('Apply all 1 reviewed edits');
  });
  it('keeps Accept edit available on a flagged suggestion', () => {
    const html = render(reviewed(summary));
    expect(html).toMatch(/<button class="studio-button"><svg[^]*?<\/svg> Accept edit<\/button>/);
  });
  it('says none can be applied together when every ready edit is flagged, then gives the left-out note', () => {
    const html = render(reviewed(summary, projects));
    const sentence = '<p>Your current CV is shown. The edits below need a check before you accept them, so none can be applied together.</p>';
    expect(html).toContain(sentence + '<p class="inline-warning">2 flagged edits were left out. Accept each one on its own after checking it.</p>');
    expect(html).not.toContain('Refresh tailoring to review the whole document');
    expect(html).not.toContain('Apply all');
  });
  it('keeps the refresh sentence when nothing is flagged and nothing is ready', () => {
    const html = render(reviewed());
    expect(html).toContain('<p>Your current CV is shown. Refresh tailoring to review the whole document against this posting.</p>');
    expect(html).not.toContain('none can be applied together');
    expect(render(reviewed(skills, summary))).not.toContain('none can be applied together');
  });
});
