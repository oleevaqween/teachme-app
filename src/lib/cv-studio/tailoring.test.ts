import { describe, expect, it } from 'vitest';
import { analysisSignature, applySuggestion, type Suggestion, type Workspace } from './schema';
import { acceptTailoredDraft, tailoredDraft, tailoringIsCurrent } from './tailoring';
import { fixture } from './test-fixture';

// Fixture fields: summary "Project manager supporting delivery teams.", skills "Reporting, stakeholder management", projects "".
const skills = (w: Workspace): Suggestion => ({ id: 'skills', target: 'skills', before: w.resume.skills, after: 'Stakeholder management, reporting',
  reason: 'Put the posting first.', status: 'pending', evidence: [{ source: 'skills', quote: w.resume.skills }] });
// Flagged: "supporting" becomes "led".
const summary = (w: Workspace): Suggestion => ({ id: 'summary', target: 'summary', before: w.resume.summary, after: 'Project manager who led delivery teams.',
  reason: 'Lead with delivery.', status: 'pending', evidence: [{ source: 'summary', quote: w.resume.summary }] });
// Flagged: "Helped" in the evidence becomes "Led" (qualifiers in the evidence do not count).
const projects = (): Suggestion => ({ id: 'projects', target: 'projects', before: '', after: 'Led the monthly reporting project.',
  reason: 'Show the reporting work.', status: 'pending', evidence: [{ source: 'notes', quote: 'Helped with the monthly reporting project.' }] });

const reviewed = (...make: ((w: Workspace) => Suggestion)[]): Workspace => {
  const w = fixture();
  w.analysis = { role: 'Project Manager', company: 'Example', overview: '', requirements: [], questions: [], suggestions: make.map(m => m(w)) };
  w.analysisInput = analysisSignature(w);
  return w;
};

describe('tailoredDraft leaves flagged edits out', () => {
  it('excludes and counts flagged edits, and still applies the unflagged ones', () => {
    const w = reviewed(skills, summary, projects), draft = tailoredDraft(w);
    expect(draft.edits.map(s => s.id)).toEqual(['skills']);
    expect(draft.flagged).toBe(2);
    expect(draft.blocked).toBe(0);
    expect(draft.resume.skills).toBe('Stakeholder management, reporting');
    expect(draft.resume.summary).toBe(w.resume.summary);
    expect(draft.resume.projects).toBe('');
  });
  it('keeps blocked for stale, unchanged or conflicting edits only', () => {
    const conflict = (w: Workspace): Suggestion => ({ ...skills(w), id: 'summary-2', target: 'summary', before: w.resume.summary, after: 'Delivery project manager.' });
    const stale = (w: Workspace): Suggestion => ({ ...summary(w), id: 'stale', target: 'experience.e1.achievements', before: 'Supported an old line.', after: 'Led an old line.' });
    const unchanged = (w: Workspace): Suggestion => ({ ...summary(w), id: 'same', target: 'projects', before: '', after: '' });
    const draft = tailoredDraft(reviewed(skills, summary, conflict, stale, unchanged));
    expect(draft.edits.map(s => s.id)).toEqual(['skills']);
    expect(draft.blocked).toBe(4);
    expect(draft.flagged).toBe(0);
  });
  it('counts nothing as flagged when the review is out of date', () => {
    const w = reviewed(skills, summary, projects);
    w.jobDescription += ' New role.';
    expect(tailoredDraft(w)).toMatchObject({ edits: [], blocked: 3, flagged: 0 });
  });
  it('treats a suggestion whose check fails as flagged', () => {
    const damaged = (): Suggestion => ({ ...projects(), after: undefined as unknown as string });
    const draft = tailoredDraft(reviewed(skills, damaged));
    expect(draft.edits.map(s => s.id)).toEqual(['skills']);
    expect(draft.flagged).toBe(1);
  });
});

describe('acceptTailoredDraft never accepts a flagged edit', () => {
  it('accepts only the unflagged edits and leaves flagged ones pending', () => {
    const w = reviewed(skills, summary, projects), before = structuredClone(w), next = acceptTailoredDraft(w);
    expect(next.analysis!.suggestions.map(s => [s.id, s.status])).toEqual([['skills', 'accepted'], ['summary', 'pending'], ['projects', 'pending']]);
    expect(next.resume.summary).toBe(w.resume.summary);
    expect(next.resume.projects).toBe('');
    expect(w).toEqual(before);
  });
  it('refuses when every ready edit is flagged', () => {
    expect(() => acceptTailoredDraft(reviewed(summary, projects))).toThrow('No current, non-conflicting edits are ready');
  });
  it('lets a flagged edit be accepted on its own as before, keeping the rest usable', () => {
    const w = reviewed(skills, summary, projects), flagged = w.analysis!.suggestions[1];
    // What the Accept edit button does: apply this one suggestion and mark it accepted.
    w.resume = applySuggestion(w.resume, flagged);
    flagged.status = 'accepted';
    expect(w.resume.summary).toBe('Project manager who led delivery teams.');
    expect(tailoringIsCurrent(w)).toBe(true);
    expect(tailoredDraft(w)).toMatchObject({ blocked: 0, flagged: 1 });
    expect(tailoredDraft(w).edits.map(s => s.id)).toEqual(['skills']);
  });
});
