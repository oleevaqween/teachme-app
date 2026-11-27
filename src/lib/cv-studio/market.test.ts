import { describe, expect, it } from 'vitest';
import { emptyResume, WorkspaceSchema, type Resume } from './schema';
import { experienceYears, lengthTarget, marketAdvice, marketLabels, marketSpelling, marketUpdate } from './market';
import { fixture } from './test-fixture';

const NOW = new Date('2026-11-17T12:00:00Z');
const role = (startDate: string) => ({ id: 'e' + startDate, company: 'Acme', title: 'Project Manager', location: '', startDate, endDate: 'Present', achievements: '' });
const withText = (patch: Partial<Resume>): Resume => ({ ...emptyResume(), ...patch });
const ids = (resume: Resume, market: 'international' | 'nigeria' | 'us' = 'international', pageSize?: 'A4' | 'LETTER') => marketAdvice(resume, market, pageSize).map(a => a.id);

describe('market basics', () => {
  it('labels markets and sets their spelling', () => {
    expect(marketLabels).toEqual({ international: 'International / UK', nigeria: 'Nigeria', us: 'US' });
    expect([marketSpelling('international'), marketSpelling('nigeria'), marketSpelling('us')]).toEqual(['en-GB', 'en-GB', 'en-US']);
  });
  it('stores the market only when set and rejects unknown values', () => {
    const w = fixture();
    expect(WorkspaceSchema.parse(w)).not.toHaveProperty('market');
    expect(WorkspaceSchema.parse({ ...w, market: 'nigeria' }).market).toBe('nigeria');
    expect(WorkspaceSchema.safeParse({ ...w, market: 'france' }).success).toBe(false);
  });
});

describe('length target', () => {
  it('counts years from the earliest start year in Experience', () => {
    expect(experienceYears(withText({ experience: [role('Mar 2019'), role('2021')] }), NOW)).toBe(7);
    expect(experienceYears(withText({ experience: [role('Present')] }), NOW)).toBeNull();
    expect(experienceYears(withText({}), NOW)).toBeNull();
  });
  it('uses one page for US under 10 years, otherwise two pages', () => {
    expect(lengthTarget('us', withText({ experience: [role('2020')] }), NOW)).toEqual({ long: 550, advice: "For US roles with under 10 years' experience, aim for one page (about 300 to 550 words)" });
    expect(lengthTarget('us', withText({ experience: [role('2010')] }), NOW)).toEqual({ long: 900, advice: 'For US roles, aim for about two pages (300 to 900 words)' });
    expect(lengthTarget('us', withText({ experience: [role('June')] }), NOW).long).toBe(900);
    expect(lengthTarget('international', withText({ experience: [role('2020')] }), NOW)).toEqual({ long: 900, advice: 'Aim for about two pages (300 to 900 words)' });
    expect(lengthTarget('nigeria', withText({ experience: [role('2020')] }), NOW).long).toBe(900);
  });
});

describe('length edge', () => {
  it('gives a US CV starting exactly 10 years ago the 900 limit', () => {
    expect(lengthTarget('us', withText({ experience: [role('2016')] }), NOW).long).toBe(900);
  });
});

describe('personal details', () => {
  it.each([
    ['Date of birth: 1 May 1990', 'market.personal.birth'],
    ['D.O.B: 01/05/1990', 'market.personal.birth'],
    ['DOB 1990', 'market.personal.birth'],
    ['Born on 1 May 1990 in Enugu', 'market.personal.birth'],
    ['Age: 34', 'market.personal.birth'],
    ['Marital status: Married', 'market.personal.marital'],
    ['Status: Single', 'market.personal.marital'],
    ['Religion: Christianity', 'market.personal.religion'],
    ['State of origin: Anambra', 'market.personal.origin'],
    ['LGA: Nnewi North', 'market.personal.origin'],
    ['Gender: Female', 'market.personal.gender'],
    ['Sex: Male', 'market.personal.gender'],
  ])('flags %s', (line, id) => {
    expect(ids(withText({ additional: line }))).toContain(id);
  });
  it.each([
    'Built a single source of truth for 12 programmes.',
    'Delivered the migration single-handedly in 3 weeks.',
    'Average: 5 releases a month.',
    'Designed assets in Adobe Illustrator.',
    'Project status: on track.',
    'Based in Lagos: open to relocation.',
    'Reached 4,000 people (by sex: 52% female, by age: 18-35).',
    'Target audience age: 18-24',
    'Published "Gender: a useful category of analysis" in a journal.',
    'A product born on a whiteboard.',
    'Visa status: single entry',
    'Gender studies and policy research.',
    'Led research on gender and pay.',
    'Religion and society reading group (organiser).',
    'Sex education programme for 400 students.',
  ])('does not flag %s', line => {
    expect(ids(withText({ summary: line }))).toEqual([]);
  });
  it('does not flag a personal email that starts with dob', () => {
    expect(ids(withText({ personal: { ...emptyResume().personal, email: 'dob.okafor@gmail.com' } }))).toEqual([]);
  });
  it('still flags labels after a separator', () => {
    expect(ids(withText({ personal: { ...emptyResume().personal, location: 'Lagos | Gender: Female' } }))).toContain('market.personal.gender');
    const found = ids(withText({ additional: 'Nationality: Nigerian; Religion: Christianity' }));
    expect(found).toContain('market.personal.religion');
    expect(ids(withText({ additional: 'Hobbies: chess\n- Religion: Islam' }))).toContain('market.personal.religion');
    expect(ids(withText({ personal: { ...emptyResume().personal, location: 'Lagos (Gender: Male)' } }))).toContain('market.personal.gender');
    expect(ids(withText({ summary: 'Visa - status: single entry' }))).toEqual([]);
    // A label followed by a typical answer, without a colon, is still a personal detail.
    for (const line of ['Gender Male', 'Sex - F', '- Gender Female', 'Lagos | Gender Male']) {
      expect(ids(withText({ additional: line })), line).toContain('market.personal.gender');
    }
    for (const line of ['Religion Christian', 'Religion - Islam', '• Religion Catholic']) {
      expect(ids(withText({ additional: line })), line).toContain('market.personal.religion');
    }
    expect(ids(withText({ additional: 'Born on May 1, 1990' }))).toContain('market.personal.birth');
    expect(ids(withText({ additional: 'DOB: 1990' }))).toContain('market.personal.birth');
  });
  it('points at where the detail was found and costs nothing to say', () => {
    const fromProfile = marketAdvice(withText({ personal: { ...emptyResume().personal, location: 'Lagos · Date of birth: 1990' } }), 'international');
    expect(fromProfile).toEqual([{ id: 'market.personal.birth', title: 'Leave out your date of birth', detail: 'UK, US and most Nigerian employers do not expect it, and it can lead to unfair screening.', target: 'profile' }]);
    expect(marketAdvice(withText({ references: 'Gender: Female' }), 'us')[0].target).toBe('references');
  });
});

describe('referees and paper size', () => {
  it('advises leaving referees off when contact details are listed, with a Nigerian note', () => {
    const listed = withText({ references: 'Mrs A. Bello, Head of PMO, Example Bank\nabello@example.com' });
    expect(marketAdvice(listed, 'international')).toEqual([{ id: 'market.referees', title: 'Leave referees off your CV', detail: 'Give their details when an employer asks.', target: 'references' }]);
    expect(marketAdvice(withText({ references: 'Mr B. Okafor +234 (0) 803 123 4567' }), 'nigeria')[0].detail).toBe('Give their details when an employer asks. Most Nigerian employers will ask for two or three, so have them ready.');
    expect(ids(withText({ references: 'Two referees from Example Bank, ext. 12' }))).toEqual([]);
  });
  it.each([
    'Mrs A. Bello, supervised me 2019 - 2021',
    'Line manager (2015-2020)',
    'Letter dated 12.05.2020',
  ])('does not take %s for a phone number', refs => {
    expect(ids(withText({ references: refs }))).toEqual([]);
  });
  it.each([
    'Mr B. Okafor +234 (0) 803 123 4567',
    'Call 0803 123 4567',
    'Phone: (020) 7946 0958',
  ])('takes %s for a phone number', refs => {
    expect(ids(withText({ references: refs }))).toEqual(['market.referees']);
  });
  it('flags "available on request"', () => {
    expect(marketAdvice(withText({ references: 'References available upon request.' }), 'us')).toEqual([{ id: 'market.on-request', title: 'Remove "References available on request"', detail: 'This line is not needed; employers assume it.', target: 'references' }]);
  });
  it('suggests the paper size each market expects', () => {
    expect(marketAdvice(withText({}), 'us', 'A4')).toEqual([{ id: 'market.paper', title: 'Use US Letter paper', detail: 'US employers expect Letter-size pages. Change it in Design.', target: 'design' }]);
    expect(marketAdvice(withText({}), 'nigeria', 'LETTER')).toEqual([{ id: 'market.paper', title: 'Use A4 paper', detail: 'Employers outside the US expect A4 pages. Change it in Design.', target: 'design' }]);
    expect(ids(withText({}), 'us', 'LETTER')).toEqual([]);
    expect(ids(withText({}), 'international', 'A4')).toEqual([]);
    expect(ids(withText({}), 'us')).toEqual([]);
  });
});

describe('market switch', () => {
  it('sets the market and its spelling together', () => {
    expect(marketUpdate('us')).toEqual({ market: 'us', spelling: 'en-US' });
    expect(marketUpdate('nigeria')).toEqual({ market: 'nigeria', spelling: 'en-GB' });
    expect(marketUpdate('international')).toEqual({ market: 'international', spelling: 'en-GB' });
    const american = { ...fixture(), spelling: 'en-US' as const };
    expect({ ...american, ...marketUpdate('nigeria') }).toMatchObject({ market: 'nigeria', spelling: 'en-GB' });
  });
});

describe('date of birth wording', () => {
  it.each(['born on the 5th of May 1990', 'Born 5 May 1990', 'Born: 05/05/1990'])('flags %s for UK and US CVs', line => {
    expect(ids(withText({ additional: line }), 'international')).toContain('market.personal.birth');
    expect(ids(withText({ additional: line }), 'us')).toContain('market.personal.birth');
  });
  it('does not flag a line ending in "born" followed by a date line', () => {
    expect(ids(withText({ additional: 'Volunteer, born\n2019 – Present' }))).toEqual([]);
  });
  it.each(['Proud Lagosian, born and raised in Lagos.', 'Supported newborn care at 3 clinics.'])('does not flag %s', line => {
    expect(ids(withText({ summary: line }))).toEqual([]);
  });
});
