import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/cv-studio/spelling/route';
import { makeWorkspace } from '@/components/cv-studio/useWorkspace';
import { emptyResume, WorkspaceSchema, type Resume } from './schema';
import { checkCvSpelling, loadSpeller, spellCheck, variantFix } from './spelling';
import type { CvField } from './cv-text';
import { fixture } from './test-fixture';

const field = (text: string, extra: Partial<CvField> = {}): CvField => ({ key: 'summary', label: 'Summary', target: 'summary', text, ...extra });
const summary = (text: string): Resume => ({ ...emptyResume(), summary: text });

describe('spelling', () => {
  it('loads each dictionary once', async () => {
    const gb = await loadSpeller('en-GB');
    const us = await loadSpeller('en-US');
    expect(gb.correct('organise')).toBe(true);
    expect(us.correct('organize')).toBe(true);
    expect(await loadSpeller('en-GB')).toBe(gb);
  });
  it('flags each misspelt word once with up to three suggestions and where it is', async () => {
    const r: Resume = { ...summary('Strong managment skills. Good managment.'),
      experience: [{ id: 'r1', title: 'Analyst', company: 'Brightway', location: '', startDate: '', endDate: '', achievements: 'Recieved 3 awards' }] };
    const result = await checkCvSpelling(r, 'en-GB', []);
    expect(result.variant).toBe('en-GB');
    expect(result.words.map(w => w.word)).toEqual(['managment', 'Recieved']);
    expect(result.words[0]).toMatchObject({ target: 'summary', where: 'Summary' });
    expect(result.words[0].suggestions[0]).toBe('management');
    expect(result.words[1]).toMatchObject({ target: 'experience', where: 'Experience · Analyst · Brightway' });
    expect(result.words[1].suggestions.length).toBeLessThanOrEqual(3);
  });
  it("never flags names, acronyms, links, numbers, CV terms or the user's own words", async () => {
    const text = 'Led Zolavi onboarding in Lagos with PMO and KPIs on SharePoint, see zolavi.com/team or ada@zolavi.com, 3x faster, Q3 workstream roadmap for stakeholders. Zentrix rollout.';
    expect((await checkCvSpelling(summary(text), 'en-GB', ['zentrix'])).words).toEqual([]);
    expect((await checkCvSpelling(summary(text), 'en-GB', [])).words.map(w => w.word)).toEqual(['Zentrix']);
  });
  it('accepts common work terms neither dictionary knows', async () => {
    const result = await checkCvSpelling(summary('Led telecoms burndown cutover infosec hypercare kickoff for the telco.'), 'en-GB', []);
    expect(result.words).toEqual([]);
    expect(result.variantWords).toEqual([]);
  });
  it('accepts hackathons, currency names and sector terms', async () => {
    expect((await checkCvSpelling(summary('Ran two hackathons and saved 2m naira.'), 'en-GB', [])).words).toEqual([]);
  });
  it('accepts hyphenated words made of real words, and possessives', async () => {
    const result = await checkCvSpelling(summary("Well-being lead. Co-ordinated cross-functional teams. Re-engineered the manager's process for the teams' budget."), 'en-GB', []);
    expect(result.words).toEqual([]);
  });
  it('checks capitalised words in title fields but treats them as names elsewhere', () => {
    const fake = { correct: (w: string) => w.toLowerCase() === 'manager', suggest: () => ['Manager'] };
    const headline = field('Projekt Manager', { key: 'personal.professionalTitle', label: 'Headline', target: 'profile', titleCase: true });
    expect(spellCheck([headline], fake, fake, []).words.map(w => w.word)).toEqual(['Projekt']);
    expect(spellCheck([field('manager Projekt')], fake, fake, []).words).toEqual([]);
  });
  it('reports the other variant once, with its fix, instead of as a typo', async () => {
    const text = 'Organized the color review and analysed the centre budget.';
    const gb = await checkCvSpelling(summary(text), 'en-GB', []);
    expect(gb.words).toEqual([]);
    expect(gb.variantWords.map(w => [w.word, w.suggestions[0]])).toEqual([['Organized', 'Organised'], ['color', 'colour']]);
    const us = await checkCvSpelling(summary(text), 'en-US', []);
    expect(us.words).toEqual([]);
    expect(us.variantWords.map(w => [w.word, w.suggestions[0]])).toEqual([['analysed', 'analyzed'], ['centre', 'center']]);
  });
  it('maps common variant patterns', async () => {
    const gb = await loadSpeller('en-GB');
    expect(['organization', 'favorite', 'modeled', 'traveling', 'catalog', 'analyze'].map(w => variantFix(w, gb)))
      .toEqual(['organisation', 'favourite', 'modelled', 'travelling', 'catalogue', 'analyse']);
  });
  it('keeps accented words whole', async () => {
    expect((await checkCvSpelling(summary('Ran the café. José led. Protégé of the director.'), 'en-GB', [])).words).toEqual([]);
    const fake = { correct: (w: string) => w.toLowerCase() === 'manager', suggest: () => [] as string[] };
    const title = field('Café Manager', { key: 'personal.professionalTitle', label: 'Headline', target: 'profile', titleCase: true });
    expect(spellCheck([title], fake, fake, []).words.map(w => w.word)).not.toContain('Caf');
  });
  it('accepts degree abbreviations and still checks plain capitalised words in titles', () => {
    const fake = { correct: (w: string) => ['economics', 'finance', 'in', 'manager'].includes(w.toLowerCase()), suggest: () => [] as string[] };
    const degree = field('BSc Economics, MSc Finance, BEng, MEng', { key: 'education.d1.degree', label: 'Education', target: 'education', titleCase: true });
    expect(spellCheck([degree], fake, fake, []).words).toEqual([]);
    expect(spellCheck([field('BSc in Economics.')], fake, fake, []).words).toEqual([]);
    const title = field('Projekt Manager', { key: 'personal.professionalTitle', label: 'Headline', target: 'profile', titleCase: true });
    expect(spellCheck([title], fake, fake, []).words.map(w => w.word)).toEqual(['Projekt']);
  });
  it('suggests a fix for a hyphenated typo from its parts', async () => {
    const result = await checkCvSpelling(summary('Led cross-funtional teams.'), 'en-GB', []);
    expect(result.words[0].word).toBe('cross-funtional');
    expect(result.words[0].suggestions[0]).toBe('cross-functional');
  });
  it('accepts an acronym possessive at the start of a sentence', async () => {
    expect((await checkCvSpelling(summary("PMO's budget grew."), 'en-GB', [])).words).toEqual([]);
  });
  it('reports hyphenated other-variant words as variant words', async () => {
    const us = await checkCvSpelling(summary('Built colour-coded reports.'), 'en-US', []);
    expect(us.words).toEqual([]);
    expect(us.variantWords.map(w => [w.word, w.suggestions[0]])).toEqual([['colour-coded', 'color-coded']]);
  });
  it('maps programme and gives no fix when the suggestion is unclear', async () => {
    const us = await loadSpeller('en-US');
    expect(variantFix('programme', us)).toBe('program');
    expect(variantFix('zzqxvk', us)).toBe('');
  });
  it('checks spelling through the local API', async () => {
    const response = await POST(new Request('http://localhost/api/cv-studio/spelling', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume: summary('Good managment.') }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.words.map((w: { word: string }) => w.word)).toEqual(['managment']);
  });
  it('stores the spelling setting and own words as optional fields, copied to applications', () => {
    const master = { ...fixture(), kind: 'master' as const, parentId: null, spelling: 'en-US' as const, ownWords: ['Zolavi'] };
    expect(WorkspaceSchema.parse(master)).toMatchObject({ spelling: 'en-US', ownWords: ['Zolavi'] });
    expect(WorkspaceSchema.parse(fixture())).not.toHaveProperty('spelling');
    expect(() => WorkspaceSchema.parse({ ...master, ownWords: Array.from({ length: 501 }, (_, i) => 'w' + i) })).toThrow();
    expect(() => WorkspaceSchema.parse({ ...master, ownWords: ['x'.repeat(61)] })).toThrow();
    expect(makeWorkspace('Application', 'application', master)).toMatchObject({ spelling: 'en-US', ownWords: ['Zolavi'] });
    expect(makeWorkspace('Master CV')).not.toHaveProperty('ownWords');
    expect(makeWorkspace('Master CV')).not.toHaveProperty('spelling');
  });
});

describe('title-cased hyphenated words', () => {
  const headline = (professionalTitle: string): Resume => ({ ...emptyResume(), personal: { ...emptyResume().personal, professionalTitle } });

  it('checks a title-cased hyphenated word part by part instead of skipping it as a brand', async () => {
    expect((await checkCvSpelling(headline('Cross-Funtional Data-Drivn Lead'), 'en-GB', [])).words.map(w => w.word)).toEqual(['Cross-Funtional', 'Data-Drivn']);
    expect((await checkCvSpelling(summary('Cross-Funtional teams delivered 3 releases.'), 'en-GB', [])).words.map(w => w.word)).toEqual(['Cross-Funtional']);
  });

  it('accepts correct title-cased hyphenated words, proper-noun parts and brand-style words', async () => {
    expect((await checkCvSpelling(headline('Cross-Functional Anglo-Nigerian Lagos-Based Trade Lead'), 'en-GB', [])).words).toEqual([]);
    expect((await checkCvSpelling(summary('PowerBI dashboards for iPhone users. Built PowerBI reports.'), 'en-GB', [])).words).toEqual([]);
  });
});
