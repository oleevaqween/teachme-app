import { describe, expect, it } from 'vitest';
import type { Resume } from './schema';
import { checkCv, HONEST_FIGURES, parseCvDate, type CvCheck } from './cv-checker';

const empty = (): Resume => ({
  personal: { fullName: '', professionalTitle: '', email: '', phone: '', location: '', linkedin: '' },
  summary: '', experience: [], education: [], skills: '', certifications: '', projects: '', additional: '',
  volunteering: [], languages: [], awards: '', training: '', publications: '', strengths: '', interests: '', references: '',
});

const SUMMARY = 'Project manager with six years in logistics operations, leading cross-functional teams to deliver routing, warehousing and supplier programmes on time. Known for clear planning, steady stakeholder communication and practical process improvements that cut cost and delay.';

function strong(): Resume {
  return {
    personal: { fullName: 'Ada Okafor', professionalTitle: 'Project Manager', email: 'ada@example.com', phone: '', location: 'Lagos, Nigeria', linkedin: '' },
    summary: SUMMARY,
    experience: [
      { id: 'r1', title: 'Operations Analyst', company: 'Brightway', location: 'Lagos', startDate: 'Jan 2019', endDate: 'Dec 2021',
        achievements: ['Built a weekly cost report used by 4 regional managers to plan spending', 'Reduced invoice errors by 30% through a new three-step approval check', 'Trained 12 new analysts on the reporting tools and data standards'].join('\n') },
      { id: 'r2', title: 'Project Manager', company: 'Northwind Logistics', location: 'Lagos', startDate: 'Jan 2022', endDate: 'Present',
        achievements: ['Led a team of 6 to deliver the new routing system two weeks early', 'Cut supplier onboarding from 14 days to 5 by redesigning the intake form', 'Managed a budget of 250,000 dollars across three regional warehouse upgrades'].join('\n') },
    ],
    education: [{ id: 'e1', degree: 'BSc Industrial Engineering', institution: 'University of Lagos', graduationYear: '2018' }],
    skills: 'Project planning, stakeholder management, budgeting, Excel, Power BI, process improvement',
    certifications: '', projects: '', additional: '',
    volunteering: [], languages: [], awards: '', training: '', publications: '', strengths: '', interests: '', references: '',
  };
}

const titles = (check: CvCheck) => check.findings.map(f => f.title);
const category = (check: CvCheck, id: string) => check.categories.find(c => c.id === id)!;
function withBullets(r: Resume, roleIndex: number, bullets: string[]): Resume {
  return { ...r, experience: r.experience.map((e, i) => i === roleIndex ? { ...e, achievements: bullets.join('\n') } : e) };
}

describe('checkCv', () => {
  it('rates a strong, complete CV as Excellent', () => {
    const check = checkCv(strong());
    expect(check.score).toBeGreaterThanOrEqual(85);
    expect(check.label).toBe('Excellent');
    const sum = check.categories.reduce((total, c) => total + c.earned, 0);
    expect(Math.abs(sum - check.score)).toBeLessThanOrEqual(1);
    expect(check.categories.map(c => [c.id, c.possible])).toEqual([['impact', 30], ['wording', 15], ['completeness', 25], ['structure', 15], ['clarity', 15]]);
  });

  it('rates an empty CV as Getting started with the core fixes', () => {
    const check = checkCv(empty());
    expect(check.score).toBeLessThan(50);
    expect(check.label).toBe('Getting started');
    expect(titles(check)).toEqual(expect.arrayContaining([
      'Add your name', 'Add an email or phone number', 'Write a summary of at least 25 words', 'Show your experience', 'List your skills',
    ]));
  });

  it('asks for real numbers, honestly, when most achievements have none', () => {
    const r = withBullets(withBullets(strong(), 0, ['Built a weekly cost report for regional managers', 'Reduced invoice errors with a new approval check', 'Trained new analysts on the reporting tools']), 1,
      ['Led the team that delivered the new routing system early', 'Cut supplier onboarding time by redesigning the intake form', 'Managed the budget across the regional warehouse upgrades']);
    const check = checkCv(r);
    const finding = check.findings.find(f => f.title === 'Add real numbers to more achievements')!;
    expect(finding.level).toBe('fix');
    expect(finding.detail).toContain('6 of 6 bullets have no figure');
    expect(finding.detail).toContain(HONEST_FIGURES);
    expect(category(check, 'impact').earned).toBeLessThan(category(checkCv(strong()), 'impact').earned);
  });

  it('does not count years or dates as figures', () => {
    const dated = withBullets(withBullets(strong(), 0, ['Built a weekly cost report in 2020', 'Moved reporting to Power BI in 2021', 'Trained new analysts from Jan 2020 to Mar 2021']),
      1, ['Led the routing system launch in 2022', 'Redesigned the supplier intake form in 2023', 'Ran the budget review since 2022']);
    expect(titles(checkCv(dated))).toContain('Add real numbers to more achievements');
  });

  it('flags weak openings such as "Responsible for"', () => {
    const r = withBullets(strong(), 0, ['Responsible for the weekly cost report used by 4 managers', 'Reduced invoice errors by 30% through a new check', 'Trained 12 new analysts on the reporting tools']);
    const finding = checkCv(r).findings.find(f => f.title.includes("'Responsible for'"))!;
    // Item 7: 5 of 6 bullets still open strongly, so no points were lost and this is only a suggestion.
    expect(finding.level).toBe('consider');
    expect(finding.target).toBe('experience');
    const lossy = withBullets(strong(), 0, ['Responsible for the weekly cost report used by 4 managers', 'Reduced invoice errors by 30% through a new check', 'Duties included training 12 new analysts on the reporting tools']);
    expect(checkCv(lossy).findings.find(f => f.title.includes("'Responsible for'"))!.level).toBe('fix');
  });

  it('flags clichés in the summary', () => {
    const check = checkCv({ ...strong(), summary: SUMMARY + ' A results-driven team player.' });
    const finding = check.findings.find(f => f.title === 'Replace generic phrases')!;
    expect(finding.detail).toContain('results-driven');
    expect(finding.detail).toContain('team player');
    expect(category(check, 'wording').earned).toBeLessThanOrEqual(12);
  });

  it('suggests dropping I and my', () => {
    const r = withBullets(strong(), 1, ['I led my team of 6 to deliver the routing system early', 'Cut supplier onboarding from 14 days to 5 by redesigning intake', 'Managed a budget of 250,000 dollars across three upgrades']);
    expect(titles(checkCv(r))).toContain("Drop 'I' and 'my'");
  });

  it('notices three bullets starting with the same word', () => {
    const r = withBullets(strong(), 1, ['Managed a team of 6 to deliver the routing system early', 'Managed supplier onboarding, cutting it from 14 days to 5', 'Managed a budget of 250,000 dollars across three upgrades']);
    expect(titles(checkCv(r))).toContain("Vary how bullets start: 3 begin with 'managed'");
  });

  it('flags duplicate achievements', () => {
    const r = withBullets(strong(), 1, ['Led a team of 6 to deliver the new routing system two weeks early', 'Led a team of 6 to deliver the new routing system two weeks early', 'Managed a budget of 250,000 dollars across three upgrades']);
    expect(titles(checkCv(r))).toContain('Remove the repeated achievement');
  });

  it('checks dates and gaps', () => {
    const backwards = strong();
    backwards.experience[0] = { ...backwards.experience[0], startDate: 'Dec 2021', endDate: 'Jan 2019' };
    expect(titles(checkCv(backwards))).toContain('Check the dates for Operations Analyst · Brightway');

    const gap = strong();
    gap.experience[0] = { ...gap.experience[0], endDate: 'Dec 2019' };
    const finding = checkCv(gap).findings.find(f => f.title.startsWith('Explain the gap between'))!;
    expect(finding.level).toBe('consider');
    expect(finding.title).toBe('Explain the gap between Operations Analyst · Brightway and Project Manager · Northwind Logistics');
  });

  it('points a gap between two volunteering roles at Volunteering, and any other gap at Experience', () => {
    const volunteer = strong();
    volunteer.volunteering = volunteer.experience.map(e => ({ id: 'v' + e.id, role: e.title, organisation: e.company, location: e.location, startDate: e.startDate, endDate: e.endDate, achievements: e.achievements }));
    volunteer.experience = [];
    volunteer.volunteering[0].endDate = 'Dec 2019';
    expect(checkCv(volunteer).findings.find(f => f.title.startsWith('Explain the gap between'))!.target).toBe('volunteering');

    const mixed = strong();
    mixed.experience[0].endDate = 'Dec 2019';
    mixed.volunteering = [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: 'Lagos', startDate: 'Jan 2022', endDate: 'Present', achievements: mixed.experience[1].achievements }];
    mixed.experience = [mixed.experience[0]];
    expect(checkCv(mixed).findings.find(f => f.title.startsWith('Explain the gap between'))!.target).toBe('experience');
  });

  it('checks the email address', () => {
    const r = strong();
    r.personal = { ...r.personal, email: 'ada-at-example' };
    expect(titles(checkCv(r))).toContain('Check your email address');
  });

  it('orders fixes before suggestions, then by points lost', () => {
    const check = checkCv(empty());
    const levels = check.findings.map(f => f.level);
    expect(levels.indexOf('consider') === -1 || levels.lastIndexOf('fix') < levels.indexOf('consider')).toBe(true);
    const fixes = check.findings.filter(f => f.level === 'fix');
    for (let i = 1; i < fixes.length; i++) expect(fixes[i - 1].pointsLost).toBeGreaterThanOrEqual(fixes[i].pointsLost);
  });

  it('always returns an integer score from 0 to 100 and never changes the CV', () => {
    for (const r of [empty(), strong(), { ...strong(), summary: '' }]) {
      const before = structuredClone(r);
      const { score } = checkCv(r);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(r).toEqual(before);
    }
  });

  it('scores volunteering achievements and points fixes at Volunteering', () => {
    const r = { ...empty(), volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: 'Lagos', startDate: 'Jan 2021', endDate: 'Dec 2022',
      achievements: 'Ran weekly coding sessions for local students\nWrote a beginner guide for new volunteers' }] };
    const check = checkCv(r);
    expect(titles(check)).not.toContain('Add achievements to your experience');
    expect(titles(check)).not.toContain('Show your experience');
    expect(check.findings.find(f => f.id === 'impact.numbers')?.target).toBe('volunteering');
    expect(category(check, 'impact').earned).toBeGreaterThan(0);
  });

  it('points a weak opening in a volunteering role at Volunteering even when jobs exist', () => {
    const r = { ...strong(), volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '',
      achievements: 'Helped students learn to code in weekly sessions\nRan 12 workshops for 40 beginners' }] };
    expect(checkCv(r).findings.find(f => f.id === 'impact.weak.helped')?.target).toBe('volunteering');
  });

  it('treats a volunteering role as filling a gap between jobs', () => {
    const gap = { ...strong(), experience: strong().experience.map(e => e.id === 'r2' ? { ...e, startDate: 'Jan 2023' } : e) };
    expect(titles(checkCv(gap, new Date(2025, 0, 1)))).toContain('Explain the gap between Operations Analyst · Brightway and Project Manager · Northwind Logistics');
    const filled = { ...gap, volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: 'Jan 2022', endDate: 'Dec 2022',
      achievements: 'Ran 12 workshops for 40 beginners\nWrote a 20-page beginner guide' }] };
    expect(titles(checkCv(filled, new Date(2025, 0, 1))).some(t => t.startsWith('Explain the gap'))).toBe(false);
  });

  it('points backwards volunteering dates at Volunteering', () => {
    const r = { ...strong(), volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: 'Jan 2023', endDate: 'Jan 2021',
      achievements: 'Ran 12 workshops for 40 beginners\nWrote a 20-page beginner guide' }] };
    expect(checkCv(r).findings.find(f => f.title === 'Check the dates for Mentor · Code Club')?.target).toBe('volunteering');
  });

  it('asks for a role and organisation on volunteering entries', () => {
    const r = { ...strong(), volunteering: [{ id: 'v1', role: 'Mentor', organisation: '', location: '', startDate: '', endDate: '', achievements: 'Ran 12 workshops for 40 beginners\nWrote a 20-page beginner guide' }] };
    expect(checkCv(r).findings.find(f => f.id === 'complete.roles')?.target).toBe('volunteering');
  });
});

describe('checkCv fairness rules', () => {
  const find = (check: CvCheck, start: string) => check.findings.find(f => f.title.startsWith(start));

  it('treats present-tense openings as strong', () => {
    const r = withBullets(withBullets(strong(), 0, ['Lead a team of 5 analysts across two sites', 'Manage a weekly cost report used by 4 managers', 'Ensure 100% of invoices are checked each month']), 1,
      ['Deliver the routing system for 6 depots', 'Collaborate with 3 suppliers on onboarding', 'Maintain a budget of 250,000 dollars']);
    const check = checkCv(r);
    expect(find(check, 'Lead more bullets')).toBeUndefined();
    expect(category(check, 'impact').earned).toBe(category(checkCv(strong()), 'impact').earned);
  });

  it('only counts dynamic and synergy as cliches in the headline and summary', () => {
    const bullet = withBullets(strong(), 1, ['Built a dynamic pricing model used by 6 regional teams', 'Cut supplier onboarding from 14 days to 5 by redesigning intake', 'Managed a budget of 250,000 dollars across three upgrades']);
    expect(titles(checkCv(bullet))).not.toContain('Replace generic phrases');
    const summary = checkCv({ ...strong(), summary: 'Dynamic professional. ' + SUMMARY });
    expect(find(summary, 'Replace generic phrases')!.target).toBe('summary');
    const headline = strong();
    headline.personal = { ...headline.personal, professionalTitle: 'Dynamic Project Manager' };
    const found = find(checkCv(headline), 'Replace generic phrases')!;
    expect(found.target).toBe('profile');
    expect(found.detail).toContain('dynamic');
    const inBullet = withBullets(strong(), 1, ['Self-starter who led a team of 6 to deliver the routing system', 'Cut supplier onboarding from 14 days to 5 by redesigning intake', 'Managed a budget of 250,000 dollars across three upgrades']);
    expect(find(checkCv(inBullet), 'Replace generic phrases')!.target).toBe('experience');
  });

  it('avoids first-person false positives', () => {
    for (const line of ['Provided Tier I support to 40 staff across two sites', 'Automated reporting (i.e. KPI packs) for 5 teams', 'Supported I.T. upgrades across 3 offices', 'Led ME programme reviews for 4 clients']) {
      const check = checkCv(withBullets(strong(), 1, [line, 'Cut supplier onboarding from 14 days to 5 by redesigning intake', 'Managed a budget of 250,000 dollars across three upgrades']));
      expect(titles(check)).not.toContain("Drop 'I' and 'my'");
    }
    for (const line of ['I led the team of 6 to deliver the routing system', 'Delivered my routing project for 6 depots early']) {
      expect(titles(checkCv(withBullets(strong(), 1, [line, 'Cut supplier onboarding from 14 days to 5 by redesigning intake', 'Managed a budget of 250,000 dollars across three upgrades'])))).toContain("Drop 'I' and 'my'");
    }
  });

  it('gives honest advice for weak openings', () => {
    const r = withBullets(strong(), 0, ['Helped with the weekly cost report used by 4 managers', 'Reduced invoice errors by 30% through a new check', 'Trained 12 new analysts on the reporting tools']);
    const finding = find(checkCv(r), "Start with what you did")!;
    expect(finding.detail).toContain('Say what you yourself did, for example "Built', );
    expect(finding.detail).toContain("If you supported someone else's work, describe your part accurately.");
    expect(finding.detail).not.toContain('Managed');
  });

  it('downgrades the weak-opening finding to a suggestion when no points were lost', () => {
    const r = withBullets(strong(), 0, ['Responsible for the weekly cost report used by 4 managers', 'Reduced invoice errors by 30% through a new check', 'Trained 12 new analysts on the reporting tools', 'Built a forecast model used by 3 teams', 'Cut report time from 5 days to 2']);
    const finding = find(checkCv(r), "Start with what you did")!;
    expect(finding.level).toBe('consider');
  });

  it('scores a projects-only CV on its project lines', () => {
    const r: Resume = { ...empty(), summary: SUMMARY, projects: ['- Built a budgeting app for 40 students', '• Wrote a thesis on road safety', '* Led a team of 4 in a hackathon'].join('\n') };
    const check = checkCv(r);
    expect(category(check, 'impact').earned).toBeGreaterThan(0);
    expect(titles(check)).not.toContain('Add achievements to your experience');
    const weakNumbers = checkCv({ ...r, projects: 'Built a budgeting app for students\nWrote a thesis on road safety' });
    expect(find(weakNumbers, 'Add real numbers')!.target).toBe('projects');
    expect(weakNumbers.findings.some(f => f.id.startsWith('structure.gap') || f.id.startsWith('structure.dates'))).toBe(false);
    const thin = checkCv({ ...r, projects: 'Built a budgeting app for 40 students' });
    expect(find(thin, 'Add at least two achievements to Projects')!.target).toBe('projects');
    expect(find(checkCv(empty()), 'Add achievements')!.target).toBe('experience');
  });

  it('flags repeated openings only when 3 or more bullets share a word and exceed 25% of bullets', () => {
    const many = withBullets(withBullets(strong(), 0, ['Led a weekly cost report used by 4 managers', 'Led invoice error reduction by 30% with a new check', 'Led training for 12 new analysts on reporting tools', 'Built a forecast model used by 3 teams', 'Cut report time from 5 days to 2', 'Wrote 6 process guides for the analyst team']), 1,
      ['Delivered the routing system for 6 depots early', 'Cut supplier onboarding from 14 days to 5', 'Saved 20,000 dollars by renegotiating 3 contracts', 'Reduced late deliveries by 15% in one quarter', 'Trained 8 drivers on the new routing tools', 'Presented monthly results to 5 directors', 'Ran 4 workshops for regional managers', 'Won a 50,000 dollar grant for tooling', 'Secured 3 new supplier agreements']);
    const check = checkCv(many);
    expect(titles(check).some(t => t.startsWith('Vary how bullets start'))).toBe(false);
    const wording = category(check, 'wording').earned;
    const fewer = checkCv(withBullets(strong(), 1, ['Managed a team of 6 to deliver the routing system early', 'Managed supplier onboarding, cutting it from 14 days to 5', 'Managed a budget of 250,000 dollars across three upgrades']));
    expect(category(fewer, 'wording').earned).toBe(wording - 3);
  });

  it('pluralises counts correctly', () => {
    const one = checkCv({ ...strong(), experience: [{ ...strong().experience[0], achievements: 'Built it' }] });
    expect(find(one, 'Expand very short bullets')!.detail).toContain('1 bullet has fewer than 6 words');
    expect(find(one, 'Add real numbers')!.detail).toContain('1 of 1 bullet has no figure');
    const long = checkCv(withBullets(strong(), 0, ['Built ' + 'a very detailed weekly report '.repeat(7) + 'for 4 managers', 'Reduced invoice errors by 30% through a new check', 'Trained 12 new analysts on the reporting tools']));
    expect(find(long, 'Shorten long bullets')!.detail).toContain('1 bullet runs past 30 words');
  });

  it('counts the empty months in a gap', () => {
    const roles = (end: string) => { const r = strong(); r.experience[0] = { ...r.experience[0], endDate: end }; return r; };
    expect(find(checkCv(roles('Jun 2021')), 'Explain the gap')).toBeUndefined();
    expect(find(checkCv(roles('May 2021')), 'Explain the gap')!.detail).toContain('About 7 months');
  });

  it('does not duplicate the summary finding for a very short summary', () => {
    const check = checkCv({ ...strong(), summary: 'Project manager in logistics.' });
    expect(titles(check)).toContain('Write a summary of at least 25 words');
    expect(titles(check)).not.toContain('Expand your summary');
  });

  it('explains an invalid email', () => {
    const r = strong();
    r.personal = { ...r.personal, email: 'ada-at-example' };
    expect(find(checkCv(r), 'Check your email address')!.detail).toBe("This doesn't look like a valid address: ada-at-example");
  });

  it('uses the supplied date for a role that ends Present', () => {
    const r = strong();
    r.experience[0] = { ...r.experience[0], startDate: 'Jan 2018', endDate: 'Present' };
    r.experience[1] = { ...r.experience[1], startDate: 'Jan 2022', endDate: 'Dec 2023' };
    expect(find(checkCv(r, new Date(2021, 2, 15)), 'Explain the gap')!.detail).toContain('About 9 months');
    expect(find(checkCv(r, new Date(2026, 10, 15)), 'Explain the gap')).toBeUndefined();
  });

  it('scales the existing areas and adds Spelling & clarity worth 15', () => {
    const check = checkCv(empty());
    expect(check.categories.map(c => c.earned)).toEqual([0, 15, 0, 6, 15]);
    expect(check.score).toBe(36);
    expect(check.spelling).toBe('pending');
  });
  it('adds spelling findings from a finished check and never lowers the score while pending or failed', () => {
    const done = checkCv(strong(), undefined, { status: 'done', result: { variant: 'en-GB',
      words: [{ word: 'managment', suggestions: ['management'], target: 'summary', where: 'Summary' }, { word: 'recieved', suggestions: ['received'], target: 'experience', where: 'Experience · Analyst' }],
      variantWords: [{ word: 'color', suggestions: ['colour'], target: 'skills', where: 'Skills' }] } });
    const spelling = done.findings.find(f => f.id === 'spelling.words')!;
    expect(spelling).toMatchObject({ category: 'clarity', level: 'fix', title: 'Check the spelling of 2 words', target: 'summary' });
    expect(spelling.words).toHaveLength(2);
    const variant = done.findings.find(f => f.id === 'spelling.variant')!;
    expect(variant.title).toBe('Use British spelling throughout');
    expect(variant.detail).toContain('color → colour');
    expect(category(done, 'clarity').earned).toBe(9);
    expect(done.spelling).toBe('done');
    const failed = checkCv(strong(), undefined, { status: 'failed' });
    expect(category(failed, 'clarity').earned).toBe(15);
    expect(failed.spelling).toBe('failed');
  });
  it('floors spelling at 0 of 10 and takes a point per clarity rule', () => {
    const words = Array.from({ length: 8 }, (_, i) => ({ word: 'wrd' + 'x'.repeat(i), suggestions: [], target: 'summary' as const, where: 'Summary' }));
    const messy = { ...strong(), summary: 'Handled various tasks etc. in order to help.', personal: { ...strong().personal, professionalTitle: 'Snr Project Mgr' } };
    const check = checkCv(messy, undefined, { status: 'done', result: { variant: 'en-GB', words, variantWords: [] } });
    expect(category(check, 'clarity').earned).toBe(3);
    expect(check.findings.filter(f => f.category === 'clarity').map(f => f.id).sort()).toEqual(['clarity.filler', 'clarity.titles', 'spelling.words']);
  });
});

describe('parseCvDate', () => {
  const now = new Date(2026, 10, 15);
  it('reads the common formats', () => {
    expect(parseCvDate('2020', 'start')).toBe(2020 * 12);
    expect(parseCvDate('2020', 'end')).toBe(2020 * 12 + 11);
    expect(parseCvDate('03/2021', 'start')).toBe(2021 * 12 + 2);
    expect(parseCvDate('3/2021', 'start')).toBe(2021 * 12 + 2);
    expect(parseCvDate('Sept 2020', 'start')).toBe(2020 * 12 + 8);
    expect(parseCvDate('January 2019', 'start')).toBe(2019 * 12);
    expect(parseCvDate('Present', 'end', now)).toBe(2026 * 12 + 10);
  });
  it('returns null for anything else', () => {
    expect(parseCvDate('', 'start')).toBeNull();
    expect(parseCvDate('junk 2020', 'start')).toBeNull();
    expect(parseCvDate('13/2020', 'start')).toBeNull();
    expect(parseCvDate('Present', 'start', now)).toBeNull();
    expect(parseCvDate('summer', 'end')).toBeNull();
  });
});

describe('market profile in the checker', () => {
  const NOW = new Date('2026-11-17T12:00:00Z');
  const sized = (words: number, startDate: string): Resume => ({
    ...empty(), summary: Array.from({ length: words }, (_, i) => 'word' + i).join(' '),
    experience: [{ id: 'e1', company: 'Acme', title: 'PM', location: '', startDate, endDate: 'Present', achievements: '' }],
  });
  const long = (check: CvCheck) => check.findings.find(f => f.id === 'structure.long');

  it('keeps 900 words as the limit by default and names the two-page target', () => {
    expect(long(checkCv(sized(600, '2020'), NOW))).toBeUndefined();
    expect(long(checkCv(sized(1000, '2020'), NOW))!.detail).toMatch(/^\d+ words\. Aim for about two pages \(300 to 900 words\), and keep the full history in your master CV\.$/);
  });

  it('uses one page for US roles under 10 years, and two pages from 10 years', () => {
    const us = { market: 'us' as const };
    expect(long(checkCv(sized(600, '2020'), NOW, undefined, us))!.detail).toContain("For US roles with under 10 years' experience, aim for one page (about 300 to 550 words)");
    expect(long(checkCv(sized(600, '2010'), NOW, undefined, us))).toBeUndefined();
    expect(long(checkCv(sized(600, '2020'), NOW, undefined, { market: 'nigeria' }))).toBeUndefined();
  });

  it('gives paper advice only once a market is chosen', () => {
    const paper = (c: CvCheck) => c.findings.find(f => f.id === 'market.paper');
    expect(paper(checkCv(sized(400, '2020'), NOW, undefined, { pageSize: 'LETTER' }))).toBeUndefined();
    expect(paper(checkCv(sized(400, '2020'), NOW, undefined, { market: 'international', pageSize: 'LETTER' }))).toBeDefined();
  });

  it('adds market advice in Length and structure without costing points', () => {
    const withReligion = { ...sized(400, '2020'), additional: 'Religion: Christianity' };
    const withHobby = { ...sized(400, '2020'), additional: 'Hobbies: Chess' };
    const flagged = checkCv(withReligion, NOW, undefined, { market: 'international', pageSize: 'LETTER' });
    const plain = checkCv(withHobby, NOW, undefined, { market: 'international', pageSize: 'A4' });
    const advice = flagged.findings.filter(f => f.id.startsWith('market.'));
    expect(advice.map(f => f.id)).toEqual(['market.personal.religion', 'market.paper']);
    expect(advice.every(f => f.category === 'structure' && f.level === 'consider' && f.pointsLost === 0)).toBe(true);
    expect(flagged.score).toBe(plain.score);
  });
});

describe('blank rows and the short-CV target', () => {
  const blankVolunteer = { id: 'v1', role: '', organisation: '', location: '', startDate: '', endDate: '', achievements: '' };

  it('does not count a blank volunteering row as experience or a blank education row as education', () => {
    const check = checkCv({ ...empty(), volunteering: [blankVolunteer], education: [{ id: 'd1', degree: ' ', institution: '', graduationYear: '' }] });
    expect(titles(check)).toContain('Show your experience');
    expect(titles(check)).not.toContain('Complete every role');
    expect(titles(check)).toContain('Add your education');
    expect(category(check, 'completeness').earned).toBe(0);
  });

  it('still counts a volunteering row with any text', () => {
    const check = checkCv({ ...empty(), volunteering: [{ ...blankVolunteer, achievements: 'Ran 12 coding workshops for 40 beginners' }] });
    expect(titles(check)).not.toContain('Show your experience');
  });

  it('ignores a blank volunteering row next to a complete job', () => {
    const without = checkCv(strong());
    const withBlank = checkCv({ ...strong(), volunteering: [blankVolunteer] });
    expect(withBlank.findings.map(f => f.id)).not.toContain('complete.roles');
    expect(category(withBlank, 'completeness').earned).toBe(category(without, 'completeness').earned);
  });

  it('scores a projects-only CV the same with a blank volunteering row', () => {
    const projectsOnly: Resume = { ...empty(), summary: SUMMARY, projects: ['- Built a budgeting app for 40 students', '• Wrote a thesis on road safety', '* Led a team of 4 in a hackathon'].join('\n') };
    const without = checkCv(projectsOnly);
    const withBlank = checkCv({ ...projectsOnly, volunteering: [blankVolunteer] });
    expect(withBlank.score).toBe(without.score);
    expect(withBlank.findings.map(f => f.id)).toEqual(without.findings.map(f => f.id));
  });

  it("names the market's length target in the short-CV advice", () => {
    const NOW = new Date('2026-11-17T12:00:00Z');
    const short = (startDate: string, market?: 'us') => checkCv({ ...empty(), summary: 'Project manager.',
      experience: [{ id: 'e1', company: 'Acme', title: 'PM', location: '', startDate, endDate: 'Present', achievements: '' }] },
    NOW, undefined, market ? { market } : {}).findings.find(f => f.id === 'structure.short')!.detail;
    expect(short('2020', 'us')).toMatch(/^\d+ words\. Most strong CVs use 300 to 550 words; add achievements, projects or skills you genuinely have\.$/);
    expect(short('2010', 'us')).toContain('Most strong CVs use 300 to 900 words;');
    expect(short('2020')).toContain('Most strong CVs use 300 to 900 words;');
  });
});

describe('spelling variant text for an American CV', () => {
  it('asks for American spelling on an en-US CV', () => {
    const one = checkCv(strong(), undefined, { status: 'done', result: { variant: 'en-US', words: [],
      variantWords: [{ word: 'colour', suggestions: ['color'], target: 'skills', where: 'Skills' }] } });
    expect(one.findings.find(f => f.id === 'spelling.variant')).toMatchObject({ title: 'Use American spelling throughout', level: 'fix', target: 'skills',
      detail: 'Your CV is set to American English, but one word uses British spelling: colour → color. Change it, or switch the spelling setting above if you are applying in the UK or Nigeria.' });
    const two = checkCv(strong(), undefined, { status: 'done', result: { variant: 'en-US', words: [], variantWords: [
      { word: 'organise', suggestions: ['organize'], target: 'summary', where: 'Summary' }, { word: 'centre', suggestions: ['center'], target: 'skills', where: 'Skills' }] } });
    expect(two.findings.find(f => f.id === 'spelling.variant')!.detail).toBe('Your CV is set to American English, but 2 words use British spelling: organise → organize, centre → center. Change them, or switch the spelling setting above if you are applying in the UK or Nigeria.');
  });
});
