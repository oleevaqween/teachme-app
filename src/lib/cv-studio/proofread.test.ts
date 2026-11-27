import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ generate: vi.fn(), config: vi.fn() }));
vi.mock('ai', () => ({ generateText: mock.generate }));
vi.mock('@/lib/llm/config', () => ({ getActiveProviderConfig: mock.config }));
vi.mock('@/lib/llm/provider', () => ({ createProvider: () => ({ chat: () => 'test-model' }) }));
import { knownNamesOf, proofreadCv, proofreadFields, proofreadProblems } from './proofread';
import { fixture } from './test-fixture';
import { profileText } from './schema';
import { loadSpeller } from './spelling';

const reply = (value: unknown) => mock.generate.mockResolvedValueOnce({ text: JSON.stringify(value), finishReason: 'stop' });
const SUMMARY = 'Project manager supporting delivery teams.';
const REPORTS = 'Prepared monthly reports for 4 stakeholders.';

describe('AI proofread (controlled provider responses)', () => {
  beforeEach(() => { vi.resetAllMocks(); mock.config.mockResolvedValue({ type: 'openai', model: 'test' }); });

  it('sends only the prose fields, never contact details', async () => {
    reply({ suggestions: [] });
    await proofreadCv(fixture());
    const prompt = String(mock.generate.mock.calls[0][0].prompt);
    expect(prompt).toContain('experience.e1.achievements');
    expect(prompt).not.toContain('ada@example.com');
    expect(proofreadFields(fixture().resume).map(f => f.key)).toEqual(['personal.professionalTitle', 'summary', 'experience.e1.achievements', 'skills']);
  });
  it('keeps a wording fix and drops fixes that change numbers, add names, raise ownership or point at missing text', async () => {
    reply({ suggestions: [
      { field: 'summary', before: SUMMARY, after: 'Project manager who supports delivery teams.', reason: 'Reads more clearly' },
      { field: 'experience.e1.achievements', before: REPORTS, after: 'Prepared monthly reports for 6 stakeholders.', reason: 'x' },
      { field: 'experience.e1.achievements', before: 'Prepared monthly reports', after: 'Prepared monthly Deloitte reports', reason: 'x' },
      { field: 'summary', before: 'supporting delivery teams', after: 'leading delivery teams', reason: 'x' },
      { field: 'personal.email', before: 'ada', after: 'Ada', reason: 'x' },
      { field: 'skills', before: 'Ran the PMO', after: 'Ran the project office', reason: 'x' },
    ] });
    const result = await proofreadCv(fixture());
    expect(result.suggestions).toEqual([{ id: 'summary#0', field: 'summary', label: 'Summary', target: 'summary', before: SUMMARY, after: 'Project manager who supports delivery teams.', reason: 'Reads more clearly' }]);
    expect(result.dropped).toBe(5);
  });
  it('normalises dashes in a kept fix', async () => {
    reply({ suggestions: [{ field: 'summary', before: SUMMARY, after: 'Project manager — supporting delivery teams.', reason: 'x' }] });
    expect((await proofreadCv(fixture())).suggestions[0].after).toBe('Project manager, supporting delivery teams.');
  });
  it('explains an unreadable reply and passes setup errors through', async () => {
    mock.generate.mockResolvedValue({ text: 'not json', finishReason: 'stop' });
    await expect(proofreadCv(fixture())).rejects.toThrow('The AI response could not be read. Your CV is unchanged; try again.');
    mock.generate.mockReset();
    reply({ wrong: true });
    await expect(proofreadCv(fixture())).rejects.toThrow('could not be read');
    mock.config.mockResolvedValue(null);
    await expect(proofreadCv(fixture())).rejects.toThrow('Configure an AI provider in Settings first.');
  });
  it('explains a missing dictionary in plain words, without calling the AI', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('C:/no-such-folder-for-teachme');
    try {
      await expect(proofreadCv({ ...fixture(), spelling: 'en-US' })).rejects.toThrow('The spelling dictionary could not be loaded. Your CV is unchanged; try again.');
      expect(mock.generate).not.toHaveBeenCalled();
    } finally { cwd.mockRestore(); }
  });
  it('returns nothing without calling the AI when the CV has no prose', async () => {
    const w = fixture();
    const blank = { ...w, resume: { ...w.resume, personal: { ...w.resume.personal, professionalTitle: '' }, summary: '', experience: [], skills: '' } };
    expect(await proofreadCv(blank)).toEqual({ suggestions: [], dropped: 0 });
    expect(mock.generate).not.toHaveBeenCalled();
  });
});

describe('proofreadProblems', () => {
  const base = fixture();
  const w = { ...base, ownWords: ['Salesforce'], resume: { ...base.resume, skills: 'Excel, Oracle', experience: base.resume.experience.map(e => ({ ...e, company: 'Deloitte' })) } };
  const cv = profileText(w.resume);
  const names = knownNamesOf(w.resume, w.ownWords);
  let isWord: (word: string) => boolean = () => true;
  beforeAll(async () => { const speller = await loadSpeller('en-GB'); isWord = word => speller.correct(word); });
  const problems = (field: string, before: string, after: string, current: string) => proofreadProblems(field, before, after, current, cv, isWord, names);
  it('treats CV names, skills and own words as facts, even at the start of a sentence', () => {
    const p = (before: string, after: string) => problems('experience.e1.achievements', before, after, before);
    expect(p('Deloitte audits completed', 'Audits completed')).toContain('changes "Deloitte"');
    expect(p('Deloitte audits completed', 'Oracle audits completed').length).toBeGreaterThan(0);
    expect(p('Prepared monthly reports', 'Salesforce reports prepared monthly')).toContain('changes "Salesforce"');
    expect(p('Prepaired monthly reports', 'Prepared monthly reports')).toEqual([]);
  });
  it('treats verb forms of the same ownership verb as the same', () => {
    const p = (before: string, after: string) => problems('experience.e1.achievements', before, after, before);
    expect(p('Lead the rollout', 'Led the rollout')).toEqual([]);
    expect(p('Manage budgets', 'Managed budgets')).toEqual([]);
    expect(p('and delivered the rollout', 'and led the rollout')).toContain('changes ownership or certainty');
  });
  it('keeps contraction fixes without an apostrophe and drops quantifier changes', () => {
    const p = (before: string, after: string) => problems('experience.e1.achievements', before, after, before);
    expect(p('didnt exceed the budget', "didn't exceed the budget")).toEqual([]);
    expect(p('some teams', 'all teams')).toContain('changes a number');
  });
  it('accepts a pure wording fix', () => {
    expect(problems('summary', SUMMARY, 'Project manager who supports delivery teams.', SUMMARY)).toEqual([]);
  });
  it('rejects added line breaks, changed numbers, new acronyms and dropped qualifiers', () => {
    expect(problems('summary', SUMMARY, 'Project manager.\nSupports teams.', SUMMARY)).toContain('adds a line break');
    expect(problems('experience.e1.achievements', REPORTS, 'Prepared monthly reports for four stakeholders.', REPORTS)).toContain('changes a number');
    expect(problems('summary', SUMMARY, 'PMP project manager supporting delivery teams.', SUMMARY)).toContain('changes "PMP"');
    expect(problems('summary', 'about 20 teams', 'twenty teams', 'Led about 20 teams').length).toBeGreaterThan(0);
  });
  const drop = (before: string, after: string, expected: string, current = before) =>
    expect(problems('experience.e1.achievements', before, after, current)).toContain(expected);
  it('keeps spelling and word-choice fixes on a first word', () => {
    const ok = (before: string, after: string) => expect(problems('experience.e1.achievements', before, after, before)).toEqual([]);
    ok('Prepaired monthly reports', 'Prepared monthly reports');
    ok('Utilised Excel', 'Used Excel');
    ok('did not exceed the budget', "didn't exceed the budget");
    ok('dont exceed the budget', "don't exceed the budget");
    ok('Led the rollout', 'Led the rollout on time.');
  });
  it('catches number words, frequency, ownership raises, negations and odd capitals', () => {
    drop('hundreds of users', 'thousands of users', 'changes a number');
    drop('first release', 'second release', 'changes a number');
    drop('monthly reports', 'weekly reports', 'changes a number');
    drop('and delivered the rollout', 'and led the rollout', 'changes ownership or certainty');
    drop('unable to attend', 'able to attend', 'changes a negation');
    drop('Sold on eBay', 'Sold on iPad', 'changes "eBay"');
  });
  it('compares facts both ways', () => {
    drop('Led four teams', 'Led five teams', 'changes a number');
    drop('Built reports in Jira', 'Built reports in Excel', 'changes "Jira"');
    drop('Prepared monthly reports', 'Salesforce reports prepared monthly', 'changes "Salesforce"');
    drop('Used Jira and Excel daily', 'Used Excel daily', 'changes "Jira"');
    drop('Never missed a deadline', 'Missed a deadline', 'changes a negation');
    drop('did not exceed the budget', 'exceeded the budget', 'changes a negation');
    drop('Saved £2m', 'Saved $2m', 'changes a number');
    drop('Contributed to the rollout', 'Delivered the rollout', 'changes ownership or certainty');
    drop('Met Émile weekly', 'Met Emile weekly', 'changes "Émile"');
  });
  it('keeps fixes that only reword', () => {
    const ok = (before: string, after: string) => expect(problems('experience.e1.achievements', before, after, before)).toEqual([]);
    ok(REPORTS, 'Prepared the monthly reports for 4 stakeholders.');
    ok('managed the budget', 'Managed the budget');
  });
  it('keeps the edge whitespace of the original wording', async () => {
    reply({ suggestions: [{ field: 'summary', before: 'Led teams ', after: 'Led groups', reason: 'x' }] });
    const w = fixture();
    const result = await proofreadCv({ ...w, resume: { ...w.resume, summary: 'Led teams and units' } });
    expect(result.suggestions[0].after).toBe('Led groups ');
  });
  it('drops one oversized item instead of failing the whole reply', async () => {
    reply({ suggestions: [
      { field: 'summary', before: 'x'.repeat(2001), after: 'y', reason: 'x' },
      { field: 'summary', before: SUMMARY, after: 'Project manager who supports delivery teams.', reason: 'ok' },
    ] });
    const result = await proofreadCv(fixture());
    expect(result.suggestions).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });
  it('rejects wording that sits inside a longer word, so Apply cannot change the wrong text', () => {
    expect(problems('summary', 'its', "it's", 'Audited credits and its policy.')).toContain('wording is part of a longer word');
  });
  it('rejects wording that occurs more than once in the field', () => {
    expect(problems('summary', 'the team', 'the whole team', 'Led the team and the team grew.')).toContain('wording is not unique');
  });
});

describe('first-word spelling fixes and number words', () => {
  const base = fixture();
  const resume = { ...base.resume, skills: 'Excel, Budgeting' };
  const names = knownNamesOf(resume);
  const cvText = profileText(resume);
  let isWord: (word: string) => boolean = () => true;
  beforeAll(async () => { const speller = await loadSpeller('en-GB'); isWord = word => speller.correct(word); });
  const problems = (before: string, after: string) => proofreadProblems('experience.e1.achievements', before, after, before, cvText, isWord, names);

  it('keeps hyphen spelling fixes that are not shared credit (co-ordinated, co-operated)', () => {
    expect(problems('Co-ordinated the rollout', 'Coordinated the rollout')).not.toContain('changes ownership or certainty');
    expect(problems('Co-operated with the audit team', 'Cooperated with the audit team')).not.toContain('changes ownership or certainty');
  });

  it('still drops a change that removes shared credit (co-led)', () => {
    expect(problems('Co-led the rollout', 'Led the rollout')).toContain('changes ownership or certainty');
    expect(problems('Co-managed the budget', 'Managed the budget')).toContain('changes ownership or certainty');
  });

  it('keeps a spelling fix to a first word even when the CV writes that word capitalised elsewhere', () => {
    expect(names.has('budgeting')).toBe(true);
    expect(problems('Budgetting for 4 sites', 'Budgeting for 4 sites')).toEqual([]);
  });

  it('still drops a first word that is not a spelling fix of the original', () => {
    expect(problems('Planned the rollout', 'Budgeting the rollout')).toContain('changes "Budgeting"');
    expect(problems('Plannned the rollout', 'Budgeting the rollout')).toContain('changes "Budgeting"');
  });

  it('does not treat a short first word as a typo of a CV name two edits away', () => {
    const named = { ...base.resume, skills: 'Excel, Mark, Bill' };
    const namedNames = knownNamesOf(named);
    const namedText = profileText(named);
    const check = (before: string, after: string) => proofreadProblems('experience.e1.achievements', before, after, before, namedText, isWord, namedNames);
    expect(check('Wrk with the team on 3 sites.', 'Mark with the team on 3 sites.')).toContain('changes "Mark"');
    expect(check('Biled clients monthly.', 'Bill clients monthly.')).toContain('changes "Bill"');
  });

  it('does not let an unrelated misspelt word mid-sentence excuse a new first-word name', () => {
    const withMark = { ...base.resume, skills: 'Excel, Mark' };
    const markNames = knownNamesOf(withMark);
    const markText = profileText(withMark);
    expect(markNames.has('mark')).toBe(true);
    const check = (before: string, after: string) => proofreadProblems('experience.e1.achievements', before, after, before, markText, isWord, markNames);
    expect(check('Planned the rollout with Marrk.', 'Mark the rollout with Marrk.')).toContain('changes "Mark"');
  });

  it('does not read "ones" as the number one', () => {
    expect(problems('Replaced the broken ones', 'Replaced the broken units')).not.toContain('changes a number');
    expect(problems('Replaced the broken one', 'Replaced the broken units')).toContain('changes a number');
    expect(problems('hundreds of users', 'thousands of users')).toContain('changes a number');
  });
});
