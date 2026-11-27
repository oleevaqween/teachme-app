import { describe, expect, it } from 'vitest';
import { LAYOUT_ISSUES, READ_ISSUES, readQuality, type ReadIssueId, type ReadSource } from './import-diagnosis';

const TEXT: ReadSource = { kind: 'text' };
const ids = (text: string, source: ReadSource = TEXT): ReadIssueId[] => readQuality(text, source).map(issue => issue.id);

/** A normal one-column CV as a PDF or Word file extracts it: short headings, dates like "Jan 2020 – Present", one skill per line. */
const CLEAN_CV = [
  'Ada Okoro',
  'Senior Project Manager',
  'Lagos, Nigeria | ada.okoro@example.com | +234 803 123 4567',
  'linkedin.com/in/ada-okoro',
  '',
  'Professional Summary',
  'Project manager with eight years of experience delivering logistics and payments programmes',
  'for banks and retailers across West Africa. Known for clear reporting and calm delivery.',
  '',
  'Professional Experience',
  'Senior Project Manager',
  'Example Logistics Ltd, Lagos',
  'Jan 2020 – Present',
  '• Led a team of 6 engineers to deliver the new payments platform on time.',
  '• Cut monthly reporting time from 5 days to 2 by automating the finance pack.',
  '• Managed a budget of ₦40,000,000 across three vendor contracts.',
  '• Ran weekly risk reviews with operations, finance and legal teams.',
  'Project Manager',
  'Brightway Retail, Abuja',
  'Mar 2016 – Dec 2019',
  '• Delivered 12 store openings across four states within budget.',
  '• Introduced a shared delivery calendar used by 40 store managers.',
  '• Negotiated revised terms with two suppliers, saving 8% on fit-out costs.',
  'Project Coordinator',
  'Northfield Bank, Lagos',
  'Jun 2014 – Feb 2016',
  '• Coordinated testing for the mobile banking launch with 3 vendors.',
  '• Prepared weekly status reports for the programme board.',
  '',
  'Education',
  'BSc Business Administration',
  'University of Lagos, 2014',
  '',
  'Certifications',
  'PRINCE2 Practitioner, 2018',
  'PMP, Project Management Institute, 2021',
  '',
  'Skills',
  'Stakeholder management',
  'Risk management',
  'Budget control',
  'Agile delivery',
  'Microsoft Project, Power BI, Excel',
  '',
  'Languages',
  'English (fluent), Yoruba (native)',
].join('\n');

/**
 * A designed two-column PDF as the app's PDF reader (unpdf) gives it: the whole sidebar first, then the main column,
 * with labels, skills, tools, interests, cities and short titles each on a line of their own.
 * Captured from @react-pdf/renderer output read back with unpdf.
 */
const TWO_COLUMN = [
  'ADA OKORO', 'Project Manager', 'CONTACT', 'Phone', '+234 803 123 4567', 'Email', 'ada@example.com', 'Address', 'Lekki Phase 1',
  'Lagos, Nigeria', 'SKILLS', 'Stakeholder management', 'Risk management', 'Budget control', 'Agile delivery', 'Vendor management',
  'Reporting', 'TOOLS', 'Power BI', 'Excel', 'Jira', 'MS Project', 'LANGUAGES', 'English Fluent', 'Yoruba Native', 'INTERESTS',
  'Chess', 'Football', 'Mentoring', 'PROFILE',
  'Project manager with eight years of experience delivering logistics and payments',
  'programmes for banks and retailers across West Africa.',
  'EXPERIENCE',
  'Senior Project Manager', 'Example Logistics Ltd', 'Lagos', 'Jan 2020 – Present',
  'Led weekly finance reviews with three teams and prepared the board pack.',
  'Project Manager', 'Brightway Retail', 'Abuja', 'Mar 2016 – Dec 2019',
  'Led weekly finance reviews with three teams and prepared the board pack.',
  'Project Coordinator', 'Northfield Bank', 'Lagos', 'Jun 2014 – Feb 2016',
  'Led weekly finance reviews with three teams and prepared the board pack.',
  'Analyst', 'Crestview Partners', 'Lagos', 'Jan 2013 – May 2014',
  'Led weekly finance reviews with three teams and prepared the board pack.',
  'EDUCATION', 'BSc Business Administration', 'University of Lagos', '2010 – 2014',
  'CERTIFICATIONS', 'PRINCE2 Practitioner', '2018', 'PMP', '2021',
].join('\n');

/** A designed CV whose text came out one or two words per line. */
const FRAGMENTED = [
  'Ada', 'Okoro', 'ada.okoro@example.com', 'Experience',
  ...Array.from({ length: 12 }, (_, i) => [`Role ${i + 1}`, 'Example Ltd', `Led weekly finance reviews for ${i + 2} teams.`]).flat(),
].join('\n');

/**
 * A Nigerian Word CV as the Word reader gives it: the personal-data table comes out one cell per line,
 * academic sessions ("2013/2014 – 2017/2018"), NYSC, "2019 – Date", skills and hobbies one per line, and referees.
 */
const NIGERIAN_WORD = [
  'CHIDINMA ADAEZE OKAFOR', 'No. 14 Adeola Odeku Street, Victoria Island, Lagos', '08031234567', 'chidinma.okafor@gmail.com',
  'CAREER OBJECTIVE',
  'To secure a challenging position in a reputable organisation where my skills in accounting and finance will be fully utilised.',
  'PERSONAL DATA', 'Date of Birth:', '12th May 1995', 'Sex:', 'Female', 'State of Origin:', 'Anambra State', 'L.G.A:', 'Nnewi North',
  'Marital Status:', 'Single', 'Nationality:', 'Nigerian', 'Religion:', 'Christianity',
  'EDUCATIONAL QUALIFICATIONS', 'University of Nigeria, Nsukka', '2013/2014 – 2017/2018', 'B.Sc. Accountancy (Second Class Upper)',
  'Federal Government Girls College, Onitsha', '2007/2013', 'Senior School Certificate (WAEC)',
  'CERTIFICATIONS', 'ICAN (Associate Chartered Accountant)', '2020', 'NYSC', '2018/2019',
  'WORK EXPERIENCE', 'Zenith Bank Plc', 'Graduate Trainee', '2019 – Date', 'Prepared daily reconciliations for 3 branch accounts.',
  'Supported month-end close and reporting.', 'Assisted customers with account opening.',
  'KPMG Nigeria', 'Audit Intern', '2017', 'Assisted in audit of 4 clients.',
  'SKILLS', 'Microsoft Excel', 'Financial Reporting', 'Reconciliation', 'Sage', 'QuickBooks', 'Teamwork', 'Communication',
  'HOBBIES', 'Reading', 'Travelling',
  'REFEREES', 'Dr. Emeka Nwosu', 'Department of Accountancy', 'University of Nigeria, Nsukka', '08039876543',
  'Mrs. Funke Adeyemi', 'Branch Manager, Zenith Bank Plc', '08051112222',
].join('\n');

/** The same kind of Nigerian CV with personal details on tab-separated lines (Word tab stops). */
const NIGERIAN_TABS = [
  'OLUWASEUN ADEWALE BELLO', 'Plot 5, Ikorodu Road, Lagos | 08123456789 | seun.bello@gmail.com',
  'CAREER OBJECTIVE', 'To work in a dynamic organisation where I can apply my skills in software development and grow professionally.',
  'PERSONAL DETAILS', 'Date of Birth:\t3rd March 1996', 'Sex:\tMale', 'State of Origin:\tOgun State', 'Marital Status:\tSingle',
  'Nationality:\tNigerian', 'Religion:\tIslam',
  'EDUCATION', 'Obafemi Awolowo University, Ile-Ife\t2013/2014 – 2018/2019', 'B.Sc. Computer Science (Second Class Upper)',
  'Lagos State Model College, Kankon\t2007 – 2013', 'WASSCE', 'NYSC\t2019/2020', 'Primary Assignment: Lagos State Ministry of Education',
  'WORK EXPERIENCE', 'Software Developer, Flutterwave\t2021 – Date', 'Built payment reconciliation services in Node.js.',
  'Reduced settlement report time from 2 hours to 15 minutes.', 'Junior Developer, Softcom Ltd\t2020 – 2021',
  'Maintained the school management platform for 30 schools.',
  'SKILLS', 'JavaScript', 'TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Git',
  'HOBBIES', 'Reading', 'Football',
  'REFEREES', 'Prof. Adebayo Ogunleye', 'Department of Computer Science', 'Obafemi Awolowo University, Ile-Ife', '08031112222',
  'Engr. Kunle Adeyemi', 'Head of Engineering, Flutterwave', '08099998888',
].join('\n');

/** A plain UK CV: one contact line, title, company and dates on their own lines, "2016–19" dates, skills one per line. */
const UK_PLAIN = [
  'James Patel', 'London | 07700 900123 | james.patel@email.co.uk | linkedin.com/in/jamespatel',
  'Profile', 'Operations analyst with four years\' experience improving warehouse throughput and reporting.',
  'Experience', 'Operations Analyst', 'Ocado Group, Hatfield', 'Sep 2021 – Present',
  'Built a weekly dashboard used by 6 site managers.', 'Cut picking errors by 12% through a revised slotting plan.',
  'Led the rollout of a new returns process across two sites.',
  'Graduate Analyst', 'Tesco, Welwyn Garden City', 'Sep 2019 – Aug 2021',
  'Analysed store availability data for the grocery team.', 'Automated a monthly stock report in Python.',
  'Education', 'University of Leeds', 'BSc Economics, 2:1', '2016–19', 'Hertfordshire Sixth Form College',
  'A Levels: Maths (A), Economics (A), Geography (B)', '2014–16',
  'Skills', 'Python', 'SQL', 'Power BI', 'Excel', 'Tableau', 'Lean Six Sigma', 'Stakeholder management',
  'Certifications', 'Lean Six Sigma Green Belt', '2022',
  'Interests', 'Running', 'Chess', 'Volunteering',
  'References', 'Available on request',
].join('\n');

/** A UK CV from a common Word template: title, company and dates on their own lines, skills comma-separated. */
const UK_TEMPLATE = [
  'Sarah Thompson', 'Manchester | 07911 123456 | sarah.thompson@outlook.com',
  'Personal Statement', 'Marketing manager with nine years\' experience in B2B campaigns, content and marketing operations for software firms.',
  'Work Experience', 'Marketing Manager', 'Sage Group', 'Jan 2022 – Present', 'Lead a team of 4 and a yearly budget of £400k.',
  'Launched an account-based programme that added 120 qualified leads a quarter.', 'Rebuilt the email nurture flow, lifting open rates from 21% to 29%.',
  'Senior Marketing Executive', 'AO.com', 'Mar 2018 – Dec 2021', 'Ran paid social campaigns across three product lines.',
  'Managed the agency relationship for the brand refresh.',
  'Marketing Executive', 'Boohoo Group', 'Sep 2015 – Feb 2018', 'Wrote product copy and weekly newsletters.',
  'Education', 'University of Manchester', 'BA (Hons) English Literature, 2:1', '2012–15', 'Xaverian College',
  'A Levels: English (A), History (B), French (B)', '2010–12',
  'Skills', 'HubSpot, Salesforce, Google Analytics 4, LinkedIn Ads, copywriting, budget management',
  'Certifications', 'CIM Diploma in Professional Marketing', '2019', 'Google Analytics Certification', '2023',
  'Interests', 'Running, choir, volunteering at a food bank',
  'References', 'Available on request',
].join('\n');

/** LinkedIn "Save to PDF" as the PDF reader gives it: sidebar first, and no email or phone in the text. */
const LINKEDIN_PDF = [
  'Contact', 'www.linkedin.com/in/ngozi-eze', '(LinkedIn)', 'Top Skills', 'Product Management', 'Agile Methodologies', 'User Research',
  'Languages', 'English (Native or Bilingual)', 'Igbo (Native or Bilingual)', 'Certifications', 'Certified Scrum Product Owner',
  'Ngozi Eze', 'Senior Product Manager at Paystack', 'Lagos, Lagos State, Nigeria', 'Summary',
  'Product manager with seven years building payments products for African merchants.',
  'Experience', 'Paystack', 'Senior Product Manager', 'January 2021 - Present (3 years 11 months)', 'Lagos, Nigeria',
  'Own the merchant dashboard roadmap and a team of 9 engineers.', 'Interswitch Group', 'Product Manager',
  'March 2018 - December 2020 (2 years 10 months)', 'Lagos, Nigeria', 'Launched a card tokenisation product used by 40 banks.',
  'Andela', 'Associate Product Manager', 'June 2016 - February 2018 (1 year 9 months)', 'Lagos',
  'Education', 'University of Lagos', 'Bachelor of Science - BS, Computer Science · (2011 - 2015)', 'Page 1 of 2',
].join('\n');

/** n non-empty lines: `fragments` of them one or two words, `gaps` of them with a wide gap, the rest a normal sentence. */
function layout(n: number, fragments: number, gaps = 0) {
  const lines: string[] = Array.from({ length: n }, (_, i) => (i < fragments ? 'Power BI' : i < fragments + gaps ? 'Excel reporting    Budget control lead' : 'Led weekly finance reviews with three teams'));
  return [...lines, 'ada@example.com', 'Experience'].join('\n');
}
/** Text with exactly `count` letters, in realistic words, plus no contact or heading noise for the letter count. */
const letters = (count: number) => 'Report '.repeat(Math.floor(count / 6)) + 'R'.repeat(count % 6);

describe('readQuality: clean text', () => {
  it('finds nothing in a normal one-column CV, as pasted text, Word or a 1-page PDF', () => {
    expect(ids(CLEAN_CV)).toEqual([]);
    expect(ids(CLEAN_CV, { kind: 'docx' })).toEqual([]);
    expect(ids(CLEAN_CV, { kind: 'pdf', pages: 1 })).toEqual([]);
  });
  it('finds nothing when skills and languages are listed one per line', () => {
    // 43 lines, 19 of them one or two words (44%), but 6 of those are section headings: 13 fragments (30%).
    const listed = CLEAN_CV.replace('Microsoft Project, Power BI, Excel', 'Microsoft Project\nPower BI\nExcel').replace('English (fluent), Yoruba (native)', 'English (fluent)\nYoruba (native)');
    expect(ids(listed)).toEqual([]);
  });
  it('returns each issue with the title and advice from the design', () => {
    const issue = readQuality('Ada Okoro\nWhere I have worked', TEXT).find(i => i.id === 'contact');
    expect(issue).toEqual({ id: 'contact', title: 'No email or phone found', advice: "We could not find an email address or phone number in the text. If your CV keeps them in a header, footer or image, employers' systems may miss them too." });
    expect(READ_ISSUES.scanned.title).toBe('Scanned or image PDF');
    expect(READ_ISSUES.scrambled.title).toBe('Scrambled layout');
    expect(READ_ISSUES.characters.title).toBe('Broken characters');
    expect(READ_ISSUES.experience.title).toBe('No experience section recognised');
    expect(LAYOUT_ISSUES).toEqual(['scanned', 'scrambled', 'characters']);
  });
  it('lists issues in display order', () => {
    expect(ids('Ada� Okoro', { kind: 'pdf', pages: 1 })).toEqual(['scanned', 'characters', 'contact', 'experience']);
  });
});

describe('readQuality: realistic Nigerian and UK CVs (regression)', () => {
  const sources: ReadSource[] = [TEXT, { kind: 'docx' }, { kind: 'pdf', pages: 1 }];
  it.each([
    ['a Nigerian Word CV with a one-cell-per-line personal-data table', NIGERIAN_WORD],
    ['a Nigerian CV with tab-separated personal details', NIGERIAN_TABS],
    ['a plain UK CV with skills one per line', UK_PLAIN],
    ['a UK Word-template CV', UK_TEMPLATE],
  ])('finds nothing in %s', (_, cv) => {
    for (const source of sources) expect(ids(cv, source)).toEqual([]);
  });
  it('finds only the missing contact in a LinkedIn PDF, which really has no email or phone in its text', () => {
    expect(ids(LINKEDIN_PDF, { kind: 'pdf', pages: 1 })).toEqual(['contact']);
  });
});

describe('readQuality: scanned or image PDF', () => {
  it('flags a PDF with fewer than 200 letters per page on average', () => {
    expect(ids('Ada Okoro\nPage 1 of 2', { kind: 'pdf', pages: 2 })).toContain('scanned');
    expect(ids(letters(199), { kind: 'pdf', pages: 1 })).toContain('scanned');
    expect(ids(letters(200), { kind: 'pdf', pages: 1 })).not.toContain('scanned');
    expect(ids(letters(597), { kind: 'pdf', pages: 3 })).toContain('scanned');
    expect(ids(letters(600), { kind: 'pdf', pages: 3 })).not.toContain('scanned');
  });
  it('treats an unknown page count as one page', () => {
    expect(ids(letters(199), { kind: 'pdf' })).toContain('scanned');
    expect(ids(letters(200), { kind: 'pdf' })).not.toContain('scanned');
    expect(ids(letters(200), { kind: 'pdf', pages: 0 })).not.toContain('scanned');
  });
  it('never flags pasted text or Word files', () => {
    expect(ids(letters(20), TEXT)).not.toContain('scanned');
    expect(ids(letters(20), { kind: 'docx' })).not.toContain('scanned');
  });
});

describe('readQuality: short colon labels', () => {
  it('never counts a one or two word line ending in a colon as a fragment', () => {
    // 40 lines: 18 "Label:" lines would be 45% fragments if they counted; without them it is 0%.
    const lines = [...Array.from({ length: 18 }, (_, i) => (i % 2 ? 'Sex:' : 'Marital Status:')), ...Array.from({ length: 22 }, () => 'Led weekly finance reviews with three teams')];
    expect(ids(lines.join('\n'))).not.toContain('scrambled');
    expect(ids(layout(38, 18))).toContain('scrambled'); // the same count of plain two-word lines still flags
  });
  it('keeps the Nigerian Word CV clean, and clean with four more label and value pairs', () => {
    expect(ids(NIGERIAN_WORD)).toEqual([]);
    const more = [NIGERIAN_WORD, 'Religion:', 'Christianity', 'Nationality:', 'Nigerian', 'Marital Status:', 'Single', 'LGA:', 'Idemili North'].join('\n');
    expect(ids(more)).toEqual([]);
  });
});

describe('readQuality: scrambled layout', () => {
  it('flags a two-column PDF read sidebar first, and a fragmented designed CV', () => {
    // TWO_COLUMN: 62 lines, 34 of them fragments (55%).
    expect(ids(TWO_COLUMN)).toEqual(['scrambled']);
    expect(ids(TWO_COLUMN, { kind: 'pdf', pages: 1 })).toEqual(['scrambled']);
    expect(ids(FRAGMENTED)).toContain('scrambled');
  });
  it('needs at least 40 non-empty lines', () => {
    expect(ids(layout(37, 37))).not.toContain('scrambled'); // 39 lines, almost all fragments
    expect(ids(layout(38, 38))).toContain('scrambled'); // 40 lines
  });
  it('flags at least 45% fragments and not fewer', () => {
    // layout adds 2 lines: the email and the "Experience" heading, neither of them a fragment.
    expect(ids(layout(38, 18))).toContain('scrambled'); // 18 of 40 = 45%
    expect(ids(layout(38, 17))).not.toContain('scrambled'); // 17 of 40 = 42.5%
  });
  it('never flags wide gaps between words on their own (Word keeps spaces typed to line up dates)', () => {
    expect(ids(layout(38, 0, 38))).toEqual([]); // 40 lines, every one with a wide gap
    expect(ids(layout(38, 17, 21))).toEqual([]); // 17 fragments (42.5%) and 21 gap lines
  });
  it('does not flag a long one-column Word CV with dates right-aligned by spaces', () => {
    const role = (i: number) => [
      `Project Engineer, Company ${'ABCDEF'[i]} Construction Limited                       Jan 20${10 + i} – Dec 20${11 + i}`,
      'Supervised site works and prepared weekly progress reports for the client.',
      'Coordinated subcontractors and checked quantities against the bill of quantities.',
      'Maintained the site diary and safety records for inspections.',
      'Reviewed drawings with the design team and raised technical queries.',
      'Led toolbox talks each Monday for the site crew.',
    ];
    const cv = ['ADEBAYO TUNDE', 'tunde@example.com', 'WORK EXPERIENCE', ...Array.from({ length: 6 }, (_, i) => role(i)).flat(), 'EDUCATION',
      'B.Eng Civil Engineering, University of Ibadan                        2005 – 2010', 'SKILLS',
      'AutoCAD, Civil 3D, MS Project, site supervision, quantity take-off, health and safety.',
      'Nigerian Society of Engineers, member since 2012, COREN registered engineer.'];
    // 44 lines, 7 of them with a wide gap and none of them a fragment.
    expect(cv).toHaveLength(44);
    expect(ids(cv.join('\n'))).toEqual([]);
    expect(ids(cv.join('\n'), { kind: 'docx' })).toEqual([]);
  });
  it('does not flag a realistic 44-line one-column CV with title, company and date lines for 6 roles', () => {
    const role = (n: number) => [`Project Manager`, 'Acme Ltd', `${2010 + n} – ${2012 + n}`, '• Led weekly finance reviews with three teams.', '• Cut reporting time by automating the monthly pack.'];
    const cv = [
      'Ada Okoro', 'Lagos, Nigeria | ada@example.com | +234 803 123 4567', 'Experience',
      ...Array.from({ length: 6 }, (_, n) => role(n)).flat(),
      'Education and Qualifications', 'BSc Business Administration, University of Lagos', 'PRINCE2 Practitioner, 2018',
      'PMP, Project Management Institute, 2021', 'Skills and Tools', 'Stakeholder management, risk management',
      'Budget control and agile delivery', 'Microsoft Project, Power BI, Excel', 'Languages spoken',
      'English (fluent), Yoruba (native)', 'References available on request',
    ];
    expect(cv).toHaveLength(44);
    expect(ids(cv.join('\n'))).toEqual([]);
  });
  it('does not count date-only lines as fragments, though they stay in the line count', () => {
    // 15 two-word lines + 3 date lines + 20 sentences + email + heading = 40 lines: 15 of 40 (37.5%); counting the dates it would be 18 of 40 (45%).
    const text = [...Array.from({ length: 15 }, () => 'Power BI'), ...Array.from({ length: 3 }, () => '2015 – 2020'),
      ...Array.from({ length: 20 }, () => 'Led weekly finance reviews with three teams'), 'ada@example.com', 'Experience'].join('\n');
    expect(ids(text)).not.toContain('scrambled');
  });
  it('keeps date-only lines in the line count and in the 45% denominator', () => {
    const build = (power: number, dates: number, sentences: number) => [...Array.from({ length: power }, () => 'Power BI'),
      ...Array.from({ length: dates }, () => '2020 – Present'),...Array.from({ length: sentences }, () => 'Led weekly finance reviews with three teams'),
      'ada@example.com', 'Experience'].join('\n');
    // 39 lines (36 fragments + 1 date + 2): under the minimum; with a second date line it is 40 lines and reaches it.
    expect(ids(build(36, 1, 0))).not.toContain('scrambled');
    expect(ids(build(36, 2, 0))).toContain('scrambled');
    // 17 fragments of 40 lines is 42.5%; if the 5 date lines left the denominator it would be 17 of 35 (48.6%).
    expect(ids(build(17, 5, 16))).not.toContain('scrambled');
  });
  /** 38 copies of the line plus an email and a heading: 40 lines, so the line alone decides the 45% test. */
  const repeated = (line: string) => [...Array.from({ length: 38 }, () => line), 'ada@example.com', 'Experience'].join('\n');
  it.each(['2015 – 2020', '2015 - 2020', 'Jan 2020 – Present', 'March 2019 - Current', '06/2018 – 05/2021', '2021',
    'Sept 2017 to Dec 2019', '2019 – Now',
    // Academic sessions.
    '2018/2019', '2018–19', '2018-19', '2020/21', '2013/2014 – 2017/2018', '2007/2013', '2016–19',
    // Open ranges.
    '2019 – Date', '2019 - date', '2016 – To Date', '2015 to date', '2016 – Till Date', '2015 till date', 'Oct 2021 – Now',
    '2017 – Present', '2017 – Current',
    // Parenthesised ranges and seasons.
    '(2019 – 2021)', '(Jan 2020 – Present)', 'Summer 2019', 'Summer 2019 – Autumn 2020'])('never counts the date line "%s" as a fragment', line => {
    expect(ids(repeated(line))).not.toContain('scrambled');
  });
  it.each(['PROFILE', 'Summary', 'Personal Statement', 'Professional Summary', 'Career Objective', 'WORK EXPERIENCE',
    'Professional Experience:', 'Employment History', 'Clinical Experience', 'Education', 'EDUCATIONAL QUALIFICATIONS', 'Skills:',
    'Key Skills', 'Core Competencies', 'Certifications', 'Training', 'Projects', 'Awards', 'Achievements', 'Publications',
    'Languages', 'Interests', 'Hobbies', 'Hobbies & Interests', 'Referees', 'References', 'Volunteering', 'Personal Details',
    'PERSONAL DATA', 'Personal Information', 'Contact', 'Contact Details'])('never counts the section heading "%s" as a fragment', line => {
    expect(ids(repeated(line))).not.toContain('scrambled');
  });
  it.each(['08031234567', '+234 803 123 4567', '07700 900123', '(512) 555-0147', 'Tel: 08031234567', '07031234567 / 08051234567',
    'ada.okoro@example.com', 'Email: ada@example.com'])('never counts the contact-only line "%s" as a fragment', line => {
    expect(ids(repeated(line))).not.toContain('scrambled');
  });
  it.each(['Power BI', 'Team Player', 'Lagos', 'NYSC 2019/2020', 'Graduated 2019', 'Ref 12345'])(
    'still counts the short line "%s" as a fragment', line => {
      expect(ids(repeated(line))).toContain('scrambled');
    });
});

describe('readQuality: broken characters', () => {
  it.each([
    ['a replacement character', 'Ada Okoro, Lagos � Nigeria'],
    ['a (cid:) code', 'Led (cid:3)(cid:4) weekly reviews'],
    ['a private-use character inside a word', 'Led weekly \uE000reviews'],
    ['a private-use character touching a word on one side', 'Lagos\uF0E0 Nigeria'],
    ['a private-use character at the end of a word', 'Project Manager\uF0B7'],
    ['two private-use characters together', 'ada@x.com \uF0E0\uF0E0 Lagos'],
  ])('flags %s', (_, line) => {
    expect(ids(`${line}\nada@example.com\nExperience`)).toEqual(['characters']);
  });
  it('does not flag a symbol-font bullet at the start of a line (Word PDFs give U+F0B7)', () => {
    expect(ids('\uF0B7 Led weekly reviews\n\uF0A7   Prepared monthly reports\nada@example.com\nExperience')).toEqual([]);
  });
  it.each([
    ['an icon between contact items', 'ada@x.com \uF0E0 +234 803 123 4567'],
    ['icons before each contact item', 'Lagos, Nigeria \uF041 ada@x.com \uF0E0 +234 803 123 4567'],
    ['an icon at the end of a line', 'ada@x.com \uF0E0'],
    ['an icon alone on its line', '\uF095\n+234 803 123 4567'],
    ['an icon after a tab', 'Phone:\t\uF095\t08031234567'],
  ])('does not flag a single private-use character standing alone: %s', (_, line) => {
    expect(ids(`${line}\nada@example.com\nExperience`)).toEqual([]);
  });
  it('flags 3 runs of five or more spaced-out letters, not 2', () => {
    const two = 'P r o j e c t\nM a n a g e r\nada@example.com\nExperience';
    expect(ids(two)).toEqual([]);
    expect(ids(two + '\nL a g o s')).toEqual(['characters']);
  });
  it('ignores short spaced runs, initials and normal accented text', () => {
    expect(ids('A B C\nJ. R. R. Tolkien\nCafé Ñandú São Paulo\nI am a b c d\nada@example.com\nExperience')).toEqual([]);
  });
});

describe('readQuality: contact details', () => {
  it.each([
    ['an email address', 'ada.okoro@example.com'],
    ['a Nigerian phone number', '+234 803 123 4567'],
    ['a UK phone number', '07700 900123'],
    ['a US phone number', '(555) 123-4567'],
  ])('accepts %s', (_, contact) => {
    expect(ids(`Ada Okoro\n${contact}\nExperience`)).toEqual([]);
  });
  it('flags text with no email or phone, even with dates and years', () => {
    expect(ids('Ada Okoro\nLagos, Nigeria\nExperience\nExample Ltd 2015 - 2020\nAwarded 12.05.2020')).toEqual(['contact']);
  });
  it.each([
    'Awards 2014 2016 2018',
    'Acme 2015 - 2020 2021 - 2023',
    'Ref 2019 2020 2021 2022',
    '1234 5678 9012 3456',
  ])('does not take "%s" for a phone number', line => {
    expect(ids(`Ada Okoro\n${line}\nExperience`)).toEqual(['contact']);
  });
  it.each([
    'Tel 07700 900123 2015 - 2020 2021',
    '555 123 4567',
    '555-123-4567',
    '555.123.4567',
    'Mobile: 803 123 4567',
    'phone. 803 123 4567',
    '+44 (0)7700 900123',
  ])('finds a phone number in "%s"', line => {
    expect(ids(`Ada Okoro\n${line}\nExperience`)).toEqual([]);
  });
});

describe('readQuality: experience heading', () => {
  it.each(['Experience', 'EXPERIENCE', 'Work history', 'Employment', 'Professional experience', 'Career history',
    'WORK EXPERIENCE:', '01. Experience', 'Relevant Experience', 'Employment History', 'Experience & Achievements',
    'Professional Experience (selected)', 'SKILLS        EXPERIENCE', 'Experience Summary', 'Work Experience Summary',
    'Education & Experience', 'Education and Experience', 'PROFESSIONAL EXPERIENCE OVERVIEW',
    // Up to four words before "Experience", joined by "and" or "&", and pieces split on "/".
    'Clinical Experience', 'Internship Experience', 'Work Experience/Internships', 'Work Experience/ Internship',
    'Industrial Training Experience', 'Field Experience', 'Practical Experience', 'Legal Experience', 'Work & Leadership Experience',
    'Teaching and Research Experience', 'Projects & Experience', 'INDUSTRIAL TRAINING / SIWES EXPERIENCE',
    'Professional Work Experience', 'Relevant Professional Work Experience'])('recognises "%s"', heading => {
    expect(ids(`Ada Okoro\nada@example.com\n${heading}\nProject Manager`)).toEqual([]);
  });
  it.each(['Where I have worked', 'My journey', 'Roles', 'Ten years of experience in logistics and delivery',
    'I bring experience summary skills to every role I do', 'Ten years of experience', 'Five Years Of Experience',
    `${'Very '.repeat(12)}Long Experience`])('flags "%s"', heading => {
    expect(ids(`Ada Okoro\nada@example.com\n${heading}\nProject Manager`)).toEqual(['experience']);
  });
});
