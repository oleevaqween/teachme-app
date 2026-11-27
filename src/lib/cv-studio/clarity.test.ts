import { describe, expect, it } from 'vitest';
import { emptyResume, type Resume } from './schema';
import { clarityFindings, hasFigure, repeatedWord } from './clarity';

type Job = Resume['experience'][number];
const role = (id: string, endDate: string, achievements: string, extra: Partial<Job> = {}): Job =>
  ({ id, title: 'Project Manager', company: 'Northwind', location: '', startDate: 'Jan 2020', endDate, achievements, ...extra });
const cv = (patch: Partial<Resume>): Resume => ({ ...emptyResume(), ...patch });
const ids = (r: Resume) => clarityFindings(r).map(f => f.id);

describe('hasFigure', () => {
  it.each([
    ['Led 4 teams in 2021', true], ['Served 2000 customers', true], ['Grew sales in 2021 by 20%', true], ['Cut costs by 30%', true],
    ['In 2021 led the rollout', false], ['Led the rollout in 2021', false], ['Delivered the programme (2019)', false],
    ['Ran the project from Jan 2020 to Mar 2021', false], ['Owned reporting since 2018', false], ['Launched 03/2021', false],
    ['Planned the 2019-2021 roadmap', false], ['2021: moved the team to Agile', false], ['Prepared the FY2023 budget', false], ['Closed the books in Q3', false],
  ])('%s has a figure: %s', (text, expected) => expect(hasFigure(text)).toBe(expected));
});

describe('clarityFindings', () => {
  it('flags passive voice with "by" and bullets that start with Was or Were', () => {
    expect(ids(cv({ experience: [role('r1', 'Present', 'The budget was managed by me and two analysts')] }))).toContain('clarity.passive');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Was given ownership of the vendor list')] }))).toContain('clarity.passive');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Managed the budget with two analysts')] }))).not.toContain('clarity.passive');
  });
  it('flags filler words but leaves weak bullet openings to the Impact check', () => {
    const findings = clarityFindings(cv({ summary: 'Experienced in various projects, reporting etc.', experience: [role('r1', 'Present', 'Responsible for payroll\nBuilt dashboards in order to track spend')] }));
    const filler = findings.find(f => f.id === 'clarity.filler')!;
    expect(filler.detail).toContain("'various'");
    expect(filler.detail).toContain("'etc.'");
    expect(filler.detail).toContain("'in order to'");
    expect(filler.detail).not.toContain('responsible for');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Built the tool and was responsible for its rollout')] }))).toContain('clarity.filler');
  });
  it('flags summary sentences over 30 words', () => {
    const words = (n: number) => Array.from({ length: n }, () => 'delivery').join(' ') + '.';
    expect(ids(cv({ summary: words(31) }))).toContain('clarity.sentences');
    expect(ids(cv({ summary: words(30) }))).not.toContain('clarity.sentences');
  });
  it('flags a word repeated in one bullet', () => {
    expect(ids(cv({ experience: [role('r1', 'Present', 'Managed the management of vendor contracts')] }))).toContain('clarity.repeat');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Reduced invoice errors by 30% with a new check')] }))).not.toContain('clarity.repeat');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Worked with finance and with operations teams')] }))).not.toContain('clarity.repeat');
  });
  it('flags present tense in a past role and mixed tenses in a current role', () => {
    expect(ids(cv({ experience: [role('r1', 'Dec 2021', 'Manage the vendor list\nBuilt a report')] }))).toContain('clarity.tense');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Manage the vendor list\nBuilt a report')] }))).toContain('clarity.tense');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Manage the vendor list\nBuild weekly reports')] }))).not.toContain('clarity.tense');
    expect(ids(cv({ experience: [role('r1', '', 'Managed the vendor list\nBuilt a report')] }))).not.toContain('clarity.tense');
    expect(ids(cv({ experience: [role('r1', 'Dec 2021', 'Managed the vendor list\nBuilt a report')] }))).not.toContain('clarity.tense');
  });
  it('flags mixed date formats across roles', () => {
    const mixed = cv({ experience: [role('r1', 'Dec 2021', 'Built a report'), role('r2', '03/2023', 'Built a report', { startDate: '2022' })] });
    expect(clarityFindings(mixed).find(f => f.id === 'clarity.dates')!.detail).toContain("'Jan 2020'");
    expect(ids(cv({ experience: [role('r1', 'Dec 2021', 'Built'), role('r2', 'Present', 'Built', { startDate: 'Feb 2022' })] }))).not.toContain('clarity.dates');
  });
  it('flags abbreviated job titles', () => {
    expect(ids(cv({ experience: [role('r1', 'Present', 'Built', { title: 'Snr Project Mgr' })] }))).toContain('clarity.titles');
    expect(ids(cv({ personal: { ...emptyResume().personal, professionalTitle: 'Asst. Manager' } }))).toContain('clarity.titles');
    expect(ids(cv({ experience: [role('r1', 'Present', 'Built', { title: 'Executive Assistant' })] }))).not.toContain('clarity.titles');
  });
  it('gives each finding the clarity category and one point', () => {
    const findings = clarityFindings(cv({ summary: 'Handled various tasks etc.' }));
    expect(findings.map(f => f.id)).toEqual(['clarity.filler']);
    for (const f of findings) { expect(f.category).toBe('clarity'); expect(f.pointsLost).toBe(1); }
  });
});

describe('hasFigure: counts next to years', () => {
  it.each([
    ['Managed a team of 2000 people', true], ['Increased sales to 2000 units', true], ['Closed Q4 250 deals', true],
    ['Grew users from 2000 to 5000', true], ['Closed Q4 25 deals', true], ['Delivered 2019 to 2021 roadmap work for 40 sites', true],
    ['Worked 2019 to 2021', false], ['Worked as an analyst between 2019 and 2021', false], ['Ran the help desk 2019 until now', false],
    ['Ran the project 2019 – present', false], ['Moved to Leeds in the spring of 2021.', false], ['Grew users to 2000', false],
    ['Finished the rollout by 2022', false], ['Hired in 2019 and 2020', false], ['Hit the Q4 2021 target', false],
    ["Beat the Q4 '21 target", false], ['Prepared the FY23 plan', false], ['Prepared the H1 2022 plan', false],
  ])('%s has a figure: %s', (text, expected) => expect(hasFigure(text)).toBe(expected));
});

describe('fewer false clarity warnings', () => {
  const ended = (achievements: string) => ids(cv({ experience: [role('r1', 'Dec 2021', achievements)] }));
  const current = (achievements: string) => ids(cv({ experience: [role('r1', 'Present', achievements)] }));

  it.each([
    'Was promoted to Senior Analyst after 18 months', 'Was quickly promoted to team lead', 'Was appointed to the board in 2020',
    'Was elected to the staff council', 'Was selected to lead the pilot', 'Was nominated to the awards panel',
    'Was invited to speak at 3 conferences', 'Was shortlisted to the final 5', 'Were selected to represent the region',
  ])('does not call "%s" passive', line => expect(current(line)).not.toContain('clarity.passive'));

  it('still flags other bullets that start with Was or Were', () => {
    expect(current('Was given ownership of the vendor list')).toContain('clarity.passive');
    expect(current('Was promoted twice in two years')).toContain('clarity.passive');
    expect(current('Was selected for the graduate scheme')).toContain('clarity.passive');
  });

  it('reads Mentor and Coach as verbs only before a person or a number', () => {
    expect(ended('Mentor 5 juniors on SQL\nBuilt a report')).toContain('clarity.tense');
    expect(ended('Mentors 3 interns each term\nBuilt a report')).toContain('clarity.tense');
    expect(ended('Coach new analysts on reporting\nBuilt a report')).toContain('clarity.tense');
    expect(ended('Mentor to five graduates\nBuilt a report')).not.toContain('clarity.tense');
    expect(ended('Coach for the youth team\nBuilt a report')).not.toContain('clarity.tense');
    expect(ended('Manage the vendor list\nBuilt a report')).toContain('clarity.tense');
  });

  it.each<[string, string | null]>([
    ['Managed the management of vendor contracts', 'managed/management'],
    ['Organised the organisation of 12 events', 'organised/organisation'],
    ['Reported weekly reporting figures to 3 directors', 'reported/reporting'],
    ['Communicated the communication plan to 40 staff', 'communicated/communication'],
    ['Processed the processes for 4 sites', 'processed/processes'],
    ['Built the tool and the tool guide', 'tool'],
    ['Communicated with the community about 3 changes', null],
    ['Generated general ledger reports for 6 teams', null],
    ['Stated the station budget for 2 years', null],
    ['Reduced invoice errors by 30% with a new check', null],
    ['Worked with finance and with operations teams', null],
    ['Ran the business process review', null],
  ])('repeatedWord("%s") is %s', (line, expected) => expect(repeatedWord(line)).toBe(expected));
});
