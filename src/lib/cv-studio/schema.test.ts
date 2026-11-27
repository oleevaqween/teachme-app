import { describe, it, expect } from 'vitest';
import {
  applySuggestion, validateAnalysis, newNumbers, checkResume, WorkspaceSchema, inputSignature, analysisSignature, profileText,
  evidenceCatalog, emptyResume, defaultLayout, LayoutSchema, type Suggestion,
} from './schema';
import { coreSectionKeys, extraSectionKeys } from './sections';
import { fixture } from './test-fixture';
const suggestion = (): Suggestion => ({
  id: 's1', target: 'summary', before: fixture().resume.summary,
  after: 'Project manager with experience preparing monthly reports for 4 stakeholders.',
  evidence: [{ source: 'experience.e1', quote: 'Prepared monthly reports for 4 stakeholders.' }], reason: 'Highlights relevant experience.', status: 'pending',
});
const analysis = () => ({ role: 'Project Manager', company: 'Example', overview: 'Relevant reporting evidence.',
  requirements: [{ requirement: 'Reporting', jobQuote: 'monthly reporting', importance: 'essential', assessment: 'supported', evidence: [{ source: 'experience.e1', quote: 'Prepared monthly reports' }], explanation: 'Direct evidence.' }],
  questions: [], suggestions: [suggestion()] });
describe('Career evidence boundaries', () => {
  it('applies an evidence-backed edit without changing the master or protected identity', () => {
    const w = fixture(), result = applySuggestion(w.resume, suggestion());
    expect(result.summary).toContain('4 stakeholders');
    expect(w.resume.summary).toBe('Project manager supporting delivery teams.');
    expect(result.personal).toEqual(w.resume.personal);
    expect(result.experience).toEqual(w.resume.experience);
  });
  it('rejects stale before text and protected field targets', () => {
    expect(() => applySuggestion(fixture().resume, { ...suggestion(), before: 'changed' })).toThrow();
    expect(() => applySuggestion(fixture().resume, { ...suggestion(), target: 'personal.fullName' })).toThrow();
  });
  it('rejects invented metrics even if the model attaches a genuine quote', () => {
    const a = analysis(); a.suggestions[0].after += ' Reduced costs by 40%.';
    const result = validateAnalysis(a, fixture());
    expect(result.suggestions).toEqual([]);
    expect(result.notices?.[0]).toContain('numbers that could not be verified');
    expect(result.requirements).toEqual(a.requirements);
  });
  it('requires exact evidence and explicit job requirement quotations', () => {
    const a = analysis(); a.suggestions[0].evidence[0].quote = 'Led a Power BI transformation';
    expect(validateAnalysis(a, fixture()).suggestions).toEqual([]);
    const b = analysis(); b.requirements[0].jobQuote = 'PMP is mandatory';
    const result = validateAnalysis(b, fixture());
    expect(result.requirements[0].assessment).toBe('unverified');
    expect(result.requirements[0].jobQuote).toBe('');
    expect(result.requirements[0].importance).toBe('inferred');
    expect(result.suggestions).toHaveLength(1);
  });
  it('withholds tailoring suggestions aimed at the headline or volunteering', () => {
    const w = fixture();
    w.resume.volunteering = [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: 'Taught students' }];
    for (const [target, before] of [['personal.professionalTitle', w.resume.personal.professionalTitle], ['volunteering.v1.achievements', 'Taught students']]) {
      const a = analysis(); a.suggestions[0] = { ...a.suggestions[0], target, before, after: 'Prepared reports for 4 stakeholders.' };
      const result = validateAnalysis(a, w);
      expect(result.suggestions).toEqual([]);
      expect(result.notices?.join(' ')).toContain('job tailoring does not edit');
    }
  });
  it('accepts traceable evidence while preserving user approval', () => {
    expect(validateAnalysis(analysis(), fixture()).suggestions[0].status).toBe('pending');
  });
  it('marks a bad requirement citation unverified without losing valid results or changing source data', () => {
    const w = fixture(), original = structuredClone(w), a = analysis();
    a.requirements.push({ ...a.requirements[0], requirement: 'Another requirement', evidence: [{ source: 'missing', quote: 'Invented evidence' }], explanation: 'The candidate is definitely qualified.' });
    const result = validateAnalysis(a, w);
    expect(result.requirements.map(r => r.assessment)).toEqual(['supported', 'unverified']);
    expect(result.requirements[1].evidence).toEqual([]);
    expect(result.requirements[1].explanation).not.toContain('definitely qualified');
    expect(result.suggestions).toHaveLength(1);
    expect(result.notices).toHaveLength(1);
    expect(w).toEqual(original);
  });
  it('does not equate an unsupported supported/partial assessment with a missing skill', () => {
    for (const assessment of ['supported', 'partial']) {
      const a = analysis(); a.requirements[0].assessment = assessment; a.requirements[0].evidence = [];
      expect(validateAnalysis(a, fixture()).requirements[0].assessment).toBe('unverified');
    }
  });
  it('recovers original whitespace in citations rather than accepting paraphrases', () => {
    const w = fixture(), a = analysis();
    w.resume.experience[0].achievements = 'Prepared monthly\r\nreports for 4 stakeholders.';
    a.requirements[0].evidence[0].quote = 'Prepared monthly reports';
    const result = validateAnalysis(a, w);
    expect(result.requirements[0].assessment).toBe('supported');
    expect(result.requirements[0].evidence[0].quote).toBe('Prepared monthly\r\nreports');
  });
  it('does not treat a missing skill as proof of lacking that skill', () => {
    const a = analysis();
    a.requirements = [{ requirement: 'Power BI', jobQuote: 'Power BI is desirable', importance: 'desirable', assessment: 'not-recorded', evidence: [], explanation: 'Ask whether the candidate has used it.' }];
    expect(validateAnalysis(a, fixture()).requirements[0].assessment).toBe('not-recorded');
  });
  it('detects changed percentages and preserves known figures', () => {
    expect(newNumbers('40% and 4 stakeholders', '40% and 4 stakeholders')).toEqual([]);
    expect(newNumbers('40%', '40')).toEqual(['40']);
  });
  it('recognizes thousands separators without weakening percent, decimal or plus checks', () => {
    expect(newNumbers('2,000,000 and 1,200.50', '2000000 and 1200.50')).toEqual([]);
    expect(newNumbers('2000000', '2,000,000')).toEqual([]);
    expect(newNumbers('40% and 10+ and 1.000', '40 and 10 and 1000')).toEqual(['40', '10', '1000']);
    expect(newNumbers('2,000,000', '20,000,000')).toEqual(['20,000,000']);
  });
  it('keeps valid suggestions and the source CV when one rewrite adds a metric', () => {
    const w = fixture(), before = structuredClone(w), a = analysis();
    a.suggestions.push({ ...suggestion(), id: 's2', after: 'Led 999 staff.' });
    const result = validateAnalysis(a, w);
    expect(result.suggestions.map(s => s.id)).toEqual(['s1']);
    expect(result.notices).toHaveLength(1);
    expect(w).toEqual(before);
    expect(a.suggestions).toHaveLength(2);
  });
  it('does not use a job requirement or unrelated uncited fact to justify a number', () => {
    const w = fixture(), a = analysis();
    w.jobDescription += ' Lead 999 staff.';
    w.evidenceNotes = '999 is a reference number, not a staff count.';
    a.suggestions[0].after = 'Led 999 staff.';
    expect(validateAnalysis(a, w).suggestions).toEqual([]);
  });
  it('withholds duplicate IDs and protected or stale targets without losing the analysis', () => {
    const a = analysis();
    a.suggestions.push(suggestion(), { ...suggestion(), id: 's2', target: 'personal.fullName' }, { ...suggestion(), id: 's3', before: 'stale' });
    const result = validateAnalysis(a, fixture());
    expect(result.suggestions).toEqual([]);
    expect(result.notices).toHaveLength(4);
    expect(result.role).toBe(a.role);
  });
  it('allows project experience without formal employment', () => {
    const r = fixture().resume; r.experience = []; r.projects = 'Built a project dashboard.';
    expect(checkResume(r).some(f => f.title === 'Show your experience')).toBe(false);
  });
});

describe('extra CV sections and old saved data', () => {
  /** A workspace body as it was stored before the extra sections existed. */
  const oldBody = () => {
    const w = JSON.parse(JSON.stringify(fixture()));
    for (const key of extraSectionKeys) delete w.resume[key];
    // Stored bodies were written in schema key order; the shared fixture lists institution before degree.
    w.resume.education = w.resume.education.map((e: { id: string; degree: string; institution: string; graduationYear: string }) =>
      ({ id: e.id, degree: e.degree, institution: e.institution, graduationYear: e.graduationYear }));
    return w;
  };

  it('loads an old CV with empty new sections and the same section order', () => {
    const parsed = WorkspaceSchema.parse(oldBody());
    expect(parsed.resume.volunteering).toEqual([]);
    expect(parsed.resume.languages).toEqual([]);
    for (const key of ['awards', 'training', 'publications', 'strengths', 'interests', 'references'] as const) expect(parsed.resume[key]).toBe('');
    expect(parsed.layout.order).toEqual([...coreSectionKeys]);
    expect(defaultLayout.order).toEqual([...coreSectionKeys]);
  });

  it('keeps the fingerprint of an old CV byte-identical', () => {
    const body = oldBody();
    const parsed = WorkspaceSchema.parse(body);
    expect(inputSignature(parsed)).toBe(JSON.stringify([body.resume, body.jobDescription, body.evidenceNotes]));
    expect(analysisSignature(parsed)).toBe(inputSignature(parsed));
  });

  it('changes the fingerprint once a new section has content', () => {
    const w = fixture();
    expect(inputSignature({ ...w, resume: { ...w.resume, languages: [{ id: 'l1', language: 'French', level: 'Fluent' }] } })).not.toBe(inputSignature(w));
    expect(inputSignature({ ...w, resume: { ...w.resume, interests: 'Chess' } })).not.toBe(inputSignature(w));
  });

  it('accepts an order of only the sections a CV uses, and rejects duplicates', () => {
    expect(LayoutSchema.parse({ ...defaultLayout, order: ['experience', 'languages'] }).order).toEqual(['experience', 'languages']);
    expect(LayoutSchema.parse({ ...defaultLayout, order: [] }).order).toEqual([]);
    expect(() => LayoutSchema.parse({ ...defaultLayout, order: ['experience', 'experience'] })).toThrow();
  });

  it('adds a section with content back into the order when loading', () => {
    const body = oldBody();
    body.resume.references = 'Available on request';
    body.layout.order = ['summary', 'experience'];
    expect(WorkspaceSchema.parse(body).layout.order).toEqual(['summary', 'experience', 'education', 'skills', 'references']);
  });

  it('includes the new sections in the CV text and evidence only when filled', () => {
    const w = fixture();
    expect(profileText(w.resume)).toBe(profileText(WorkspaceSchema.parse(oldBody()).resume));
    expect(Object.keys(evidenceCatalog(w))).toEqual(Object.keys(evidenceCatalog(WorkspaceSchema.parse(oldBody()))));
    const filled = { ...w.resume,
      volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: 'Lagos', startDate: '2021', endDate: '2022', achievements: 'Mentored 8 students' }],
      languages: [{ id: 'l1', language: 'French', level: 'Fluent' as const }], awards: 'Employee of the year 2023' };
    const text = profileText(filled);
    expect(text).toContain('Mentored 8 students');
    expect(text).toContain('French: Fluent');
    expect(text).toContain('Employee of the year 2023');
    const catalog = evidenceCatalog({ ...w, resume: filled });
    expect(catalog['volunteering.v1']).toContain('Mentored 8 students');
    expect(catalog.languages).toBe('French: Fluent');
    expect(catalog.awards).toBe('Employee of the year 2023');
    expect(catalog.training).toBeUndefined();
  });

  it('counts volunteering as experience in the document checks', () => {
    const base = { ...emptyResume(), personal: { ...emptyResume().personal, fullName: 'Ada' } };
    expect(checkResume(base).map(f => f.title)).toContain('Show your experience');
    const withVolunteering = { ...base, volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: '' }] };
    expect(checkResume(withVolunteering).map(f => f.title)).not.toContain('Show your experience');
  });
});

describe('design settings in saved layouts', () => {
  it('keeps an old layout byte-identical', () => {
    const old = { template: 'studio', accent: 'navy', fontSize: 10, pageSize: 'A4', order: ['summary', 'experience'] };
    expect(JSON.stringify(LayoutSchema.parse(old))).toBe(JSON.stringify(old));
  });

  it('accepts new colours, a custom colour and font pairs, and never fails on a junk custom colour', () => {
    expect(LayoutSchema.parse({ ...defaultLayout, accent: 'burgundy', fontPair: 'garamond' })).toMatchObject({ accent: 'burgundy', fontPair: 'garamond' });
    expect(LayoutSchema.parse({ ...defaultLayout, accent: 'custom', customAccent: 'junk' }).customAccent).toBe('junk');
    expect(() => LayoutSchema.parse({ ...defaultLayout, fontPair: 'comic-sans' })).toThrow();
  });

  it('accepts column settings and keeps them optional', () => {
    expect(LayoutSchema.parse({ ...defaultLayout, columns: 'left', sideSections: ['skills', 'summary'] })).toMatchObject({ columns: 'left', sideSections: ['skills', 'summary'] });
    expect('columns' in LayoutSchema.parse(defaultLayout)).toBe(false);
    expect('sideSections' in LayoutSchema.parse(defaultLayout)).toBe(false);
    expect(() => LayoutSchema.parse({ ...defaultLayout, columns: 'three' })).toThrow();
  });
});
