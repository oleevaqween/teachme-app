import { describe, expect, it } from 'vitest';
import { parseCvDate } from './cv-checker';
import { applyCut, bulletScore, cutAdvice, cutLines, cutPlan, cutSummary, cvWords, keepCount, refreshCutPlan, ROLE_CHANGED, roleChangedMessage } from './condense';
import { emptyResume, type Resume, type Workspace } from './schema';
import { fixture } from './test-fixture';

const NOW = new Date('2026-11-17T12:00:00Z');
const end = (text: string) => parseCvDate(text, 'end', NOW)!;
const filler = (n: number) => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
const role = (id: string, endDate: string, achievements: string) => ({ id, company: 'Org ' + id, title: 'Manager', location: '', startDate: '2000', endDate, achievements });
const volunteer = (id: string, endDate: string, achievements: string) => ({ id, organisation: 'Club ' + id, role: 'Volunteer', location: '', startDate: '2000', endDate, achievements });
const OLD = '• Led 3 teams of 12 people\n• Attended weekly meetings with the board\n• Managed the Power BI rollout for 4 sites\n• Helped with filing and archiving';
const app = (resume: Resume, extra: Partial<Workspace> = {}): Workspace => ({ ...fixture(), kind: 'application', analysis: null, analysisInput: null, resume, ...extra });
/** A resume whose word count is exactly the 900-word limit plus `over`. */
function sized(roles: Resume['experience'], over: number, volunteering: Resume['volunteering'] = []): Resume {
  const base: Resume = { ...emptyResume(), experience: roles, volunteering };
  return { ...base, summary: filler(900 - cvWords(base) + over) };
}

describe('which roles qualify', () => {
  it('keeps 2 bullets for roles that ended 10 to 15 years ago and none for older ones', () => {
    expect(keepCount(end('Nov 2016'), NOW)).toBe(2);
    expect(keepCount(end('Dec 2016'), NOW)).toBeNull();
    expect(keepCount(end('2012'), NOW)).toBe(2);
    expect(keepCount(end('Nov 2011'), NOW)).toBe(0);
    expect(keepCount(end('2008'), NOW)).toBe(0);
    expect(keepCount(end('Present'), NOW)).toBeNull();
  });
});

describe('bullet strength', () => {
  it('scores figures, strong verbs and job terms (at most 2)', () => {
    expect(bulletScore('Led 3 teams of 12 people', [])).toBe(3);
    expect(bulletScore('Managed the Power BI rollout for 4 sites', ['Power BI'])).toBe(4);
    expect(bulletScore('Sat in on weekly meetings', [])).toBe(0);
    expect(bulletScore('Daily reporting in SQL, Excel and Power BI', ['SQL', 'Excel', 'Power BI'])).toBe(2);
    expect(bulletScore('In 2019 joined the team', [])).toBe(0);
  });
  it('keeps the strongest bullets in their original order and removes only the other lines', () => {
    expect(cutLines(OLD, 2, ['Power BI'])).toEqual({
      kept: ['Led 3 teams of 12 people', 'Managed the Power BI rollout for 4 sites'],
      removed: ['Attended weekly meetings with the board', 'Helped with filing and archiving'],
      after: '• Led 3 teams of 12 people\n• Managed the Power BI rollout for 4 sites',
    });
    expect(cutLines('- Wrote notes\n- Filed papers\n- Booked rooms', 2, [])).toMatchObject({ kept: ['Wrote notes', 'Filed papers'], removed: ['Booked rooms'], after: '- Wrote notes\n- Filed papers' });
    expect(cutLines(OLD, 0, [])).toMatchObject({ kept: [], after: '' });
  });
});

describe('cut plan', () => {
  it('proposes the oldest role first and stops once within the limit', () => {
    const resume = sized([role('new', 'Present', '• Led 5 people'), role('mid', '2013', OLD), role('old', '2008', OLD)], 5);
    const plan = cutPlan(app(resume), NOW);
    expect(plan.proposals.map(p => p.id)).toEqual(['experience.old']);
    expect(plan.proposals[0]).toMatchObject({ section: 'experience', entryId: 'old', label: 'Manager · Org old', dates: '2000 – 2008', before: OLD, after: '', kept: [] });
    expect(plan).toMatchObject({ before: 905, limit: 900, marketLabel: 'International / UK', overBy: 0, nothingQualifies: false });
    expect(plan.after).toBe(cvWords(applyCut(resume, plan.proposals[0])));
    expect(cutSummary(plan)).toBe(`905 → ${plan.after} words · target 900 (International / UK)`);
    expect(cutAdvice(plan)).toBeNull();
  });

  it('lists every qualifying role, including volunteering, and says how far over it still is', () => {
    const resume = sized([role('mid', '2013', OLD), role('old', '2008', OLD)], 500, [volunteer('v', '2010', OLD)]);
    const plan = cutPlan(app(resume), NOW);
    expect(plan.proposals.map(p => p.id)).toEqual(['experience.old', 'volunteering.v', 'experience.mid']);
    expect(plan.overBy).toBe(plan.after - 900);
    expect(plan.overBy).toBeGreaterThan(0);
    expect(cutAdvice(plan)).toBe(`Still ${plan.overBy} words over. Trim your recent roles yourself, or shorten the summary.`);
  });

  it('uses the market limit and says when nothing qualifies', () => {
    const recentOnly = sized([role('new', 'Present', OLD)], 50);
    const plan = cutPlan(app(recentOnly), NOW);
    expect(plan).toMatchObject({ proposals: [], nothingQualifies: true, allDismissed: false });
    expect(cutAdvice(plan)).toBe('No older roles to trim. Trim your recent roles yourself, or shorten the summary.');
    const us = cutPlan(app({ ...recentOnly, experience: [{ ...recentOnly.experience[0], startDate: '2020' }] }, { market: 'us' }), NOW);
    expect(us).toMatchObject({ limit: 550, marketLabel: 'US' });
  });

  it('proposes nothing within the limit, for master CVs, or for roles without bullets or with unreadable dates', () => {
    expect(cutPlan(app(sized([role('old', '2008', OLD)], -10)), NOW)).toMatchObject({ proposals: [], nothingQualifies: false });
    expect(cutPlan({ ...app(sized([role('old', '2008', OLD)], 50)), kind: 'master' }, NOW)).toMatchObject({ proposals: [], nothingQualifies: false });
    expect(cutPlan(app(sized([role('old', '2008', ''), role('odd', 'sometime', OLD)], 50)), NOW).proposals).toEqual([]);
  });
});

describe('cut ids', () => {
  it('never proposes the same role twice, even if two entries share an id', () => {
    const resume = sized([role('dup', '2008', OLD), role('dup', '2009', OLD), role('new', 'Present', '• Led 5 people')], 5);
    const ids = cutPlan(app(resume), NOW).proposals.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('applying a cut', () => {
  it('replaces only that role, and refuses when the role has changed', () => {
    const resume = sized([role('old', '2008', OLD), role('new', 'Present', '• Led 5 people')], 5);
    const [proposal] = cutPlan(app(resume), NOW).proposals;
    const cut = applyCut(resume, proposal);
    expect(cut.experience.map(e => e.achievements)).toEqual(['', '• Led 5 people']);
    const edited = { ...resume, experience: resume.experience.map(e => (e.id === 'old' ? { ...e, achievements: OLD + '\n• New line' } : e)) };
    expect(() => applyCut(edited, proposal)).toThrow(roleChangedMessage(proposal.label));
  });

  it('names the role that changed, so Apply all says which one to look at', () => {
    expect(roleChangedMessage('Project Manager · Sahel Logistics')).toBe(
      'Project Manager · Sahel Logistics has changed since the suggestions were made. Press Suggest cuts again.'
    );
    expect(roleChangedMessage('  ')).toBe(ROLE_CHANGED);
  });
});

describe('live plan numbers', () => {
  const twoRoles = () => sized([role('a', '2008', OLD), role('b', '2009', OLD)], 40);
  it('recounts after one of two proposals is applied', () => {
    const resume = twoRoles();
    const plan = cutPlan(app(resume), NOW);
    expect(plan.proposals).toHaveLength(2);
    const applied = applyCut(resume, plan.proposals[0]);
    const refreshed = refreshCutPlan(app(applied), plan, NOW);
    expect(refreshed.before).toBe(cvWords(applied));
    expect(refreshed.proposals.map(p => p.id)).toEqual([plan.proposals[1].id]);
    expect(refreshed.after).toBe(cvWords(applyCut(applied, plan.proposals[1])));
    expect(refreshed.overBy).toBe(Math.max(0, refreshed.after - 900));
  });
  it('stops counting a dismissed proposal', () => {
    const resume = twoRoles();
    const plan = cutPlan(app(resume), NOW);
    const dismissed = { ...plan, proposals: plan.proposals.slice(1) };
    const refreshed = refreshCutPlan(app(resume), dismissed, NOW);
    expect(refreshed.before).toBe(cvWords(resume));
    expect(refreshed.after).toBe(cvWords(applyCut(resume, plan.proposals[1])));
    expect(refreshed.after).toBeGreaterThan(plan.after);
  });
  it('follows a market switch', () => {
    const resume = sized([{ ...role('new', 'Present', '• Led 5 people'), startDate: '2025' }, { ...role('old', '2008', OLD), startDate: '2024' }], 40);
    const plan = cutPlan(app(resume), NOW);
    const refreshed = refreshCutPlan(app(resume, { market: 'us' }), plan, NOW);
    expect(refreshed.limit).toBe(550);
    expect(refreshed.marketLabel).toBe('US');
  });
  it('drops a proposal when its role was edited or removed', () => {
    const resume = twoRoles();
    const plan = cutPlan(app(resume), NOW);
    const edited = { ...resume, experience: resume.experience.map(e => (e.id === 'a' ? { ...e, achievements: e.achievements + '\n• Extra' } : e)) };
    expect(refreshCutPlan(app(edited), plan, NOW).proposals.map(p => p.entryId)).toEqual(['b']);
    const removed = { ...resume, experience: resume.experience.filter(e => e.id !== 'a') };
    expect(refreshCutPlan(app(removed), plan, NOW).proposals.map(p => p.entryId)).toEqual(['b']);
  });
  it('keeps nothingQualifies as stored', () => {
    const resume = twoRoles();
    const plan = { ...cutPlan(app(resume), NOW), proposals: [], nothingQualifies: true };
    expect(refreshCutPlan(app(resume), plan, NOW).nothingQualifies).toBe(true);
  });
});

describe('wrapped bullets', () => {
  const WRAPPED = '• Cut costs by 20%\n  without redundancies\n• Attended meetings\n• Led 4 audits';
  it('keeps a wrapped bullet and its continuation together', () => {
    const cut = cutLines(WRAPPED, 2, []);
    expect(cut.kept).toEqual(['Cut costs by 20% without redundancies', 'Led 4 audits']);
    expect(cut.removed).toEqual(['Attended meetings']);
    expect(cut.after).toBe('• Cut costs by 20%\n  without redundancies\n• Led 4 audits');
  });
  it('removes a wrapped bullet as one unit', () => {
    const cut = cutLines('• Led 4 audits\n• Booked rooms\n  and chairs', 1, []);
    expect(cut.removed).toEqual(['Booked rooms and chairs']);
    expect(cut.after).toBe('• Led 4 audits');
  });
  it('treats every line as its own bullet when none are marked', () => {
    expect(cutLines('Led 4 audits\nBooked rooms', 1, [])).toEqual({ kept: ['Led 4 audits'], removed: ['Booked rooms'], after: 'Led 4 audits' });
  });
});

describe('applyCut with duplicate ids', () => {
  it('changes only the first entry with that id', () => {
    const resume: Resume = { ...emptyResume(), experience: [role('dup', '2008', OLD), role('dup', '2008', '• Other text')] };
    const single: Resume = { ...emptyResume(), summary: filler(1000), experience: [role('dup', '2008', OLD)] };
    const proposal = cutPlan(app(single), NOW).proposals[0];
    const next = applyCut(resume, proposal);
    expect(next.experience[0].achievements).toBe(proposal.after);
    expect(next.experience[1].achievements).toBe('• Other text');
  });
});

describe('dismissed roles', () => {
  it('leaves out dismissed roles and proposes the next qualifying one instead', () => {
    const resume = sized([role('a', '2008', OLD), role('b', '2009', OLD)], 5);
    expect(cutPlan(app(resume), NOW).proposals.map(p => p.id)).toEqual(['experience.a']);
    expect(cutPlan(app(resume), NOW, new Set(['experience.a'])).proposals.map(p => p.id)).toEqual(['experience.b']);
    expect(cutPlan(app(resume), NOW, new Set(['experience.a', 'experience.b']))).toMatchObject({ proposals: [], nothingQualifies: true });
  });
  it('says the suggestions were dismissed (not that no older roles exist) when every qualifying role was dismissed', () => {
    const resume = sized([role('a', '2008', OLD), role('b', '2009', OLD)], 5);
    const plan = cutPlan(app(resume), NOW, new Set(['experience.a', 'experience.b']));
    expect(plan).toMatchObject({ proposals: [], nothingQualifies: true, allDismissed: true });
    expect(cutAdvice(plan)).toBe("You've dismissed every suggested cut. Trim your recent roles yourself, or shorten the summary. Reload the page to bring the suggestions back.");
  });
  it('keeps the no-older-roles advice when a dismissed role would not have qualified anyway', () => {
    const recentOnly = sized([role('new', 'Present', OLD)], 50);
    const plan = cutPlan(app(recentOnly), NOW, new Set(['experience.new']));
    expect(plan).toMatchObject({ proposals: [], nothingQualifies: true, allDismissed: false });
    expect(cutAdvice(plan)).toBe('No older roles to trim. Trim your recent roles yourself, or shorten the summary.');
  });
  it('is not all-dismissed while a qualifying role is still proposed', () => {
    const resume = sized([role('a', '2008', OLD), role('b', '2009', OLD)], 5);
    expect(cutPlan(app(resume), NOW, new Set(['experience.a']))).toMatchObject({ allDismissed: false });
  });
});
