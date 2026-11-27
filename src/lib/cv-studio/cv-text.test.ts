import { describe, expect, it } from 'vitest';
import { emptyResume, type Resume } from './schema';
import { applyProofread, bulletsOf, cvTextFields, fieldText, withFieldText } from './cv-text';

const resume = (): Resume => ({
  ...emptyResume(), summary: 'Project manager.', skills: 'Excel', awards: 'Employee of the year',
  personal: { ...emptyResume().personal, professionalTitle: 'Snr Project Mgr' },
  experience: [{ id: 'r1', title: 'Analyst', company: 'Brightway', location: '', startDate: 'Jan 2019', endDate: 'Dec 2021', achievements: '• Built a report\nCut costs by 5%' }],
  volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: 'Coached 8 students' }],
  education: [{ id: 'd1', degree: 'BSc Economics', institution: 'Unilag', graduationYear: '2018' }],
});

describe('CV text fields', () => {
  it('lists the prose fields in reading order with labels and targets', () => {
    const fields = cvTextFields(resume());
    expect(fields.map(f => f.key)).toEqual(['personal.professionalTitle', 'summary', 'experience.r1.title', 'experience.r1.achievements',
      'volunteering.v1.role', 'volunteering.v1.achievements', 'projects', 'education.d1.degree', 'skills', 'certifications', 'additional',
      'awards', 'training', 'publications', 'strengths', 'interests']);
    expect(fields.find(f => f.key === 'experience.r1.achievements')).toMatchObject({ label: 'Experience · Analyst · Brightway', target: 'experience' });
    expect(fields.find(f => f.key === 'experience.r1.title')).toMatchObject({ label: 'Experience · Analyst · Brightway (job title)', titleCase: true });
    expect(fields.find(f => f.key === 'personal.professionalTitle')).toMatchObject({ label: 'Headline', target: 'profile', titleCase: true });
    expect(fields.find(f => f.key === 'awards')!.target).toBe('awards');
  });
  it('reads and writes a field by key without changing the original', () => {
    const r = resume();
    expect(fieldText(r, 'experience.r1.achievements')).toBe('• Built a report\nCut costs by 5%');
    expect(fieldText(r, 'experience.zz.achievements')).toBeNull();
    expect(fieldText(r, 'personal.email')).toBeNull();
    expect(fieldText(r, 'experience.r1.company')).toBeNull();
    const next = withFieldText(r, 'volunteering.v1.achievements', 'Coached 9 students')!;
    expect(next.volunteering[0].achievements).toBe('Coached 9 students');
    expect(r.volunteering[0].achievements).toBe('Coached 8 students');
    expect(withFieldText(r, 'personal.professionalTitle', 'Senior Project Manager')!.personal.professionalTitle).toBe('Senior Project Manager');
    expect(withFieldText(r, 'summary', 'Lead.')!.summary).toBe('Lead.');
    expect(withFieldText(r, 'nothing', 'x')).toBeNull();
  });
  it('rejects inherited property names as section keys', () => {
    const r = resume();
    expect(fieldText(r, 'constructor.x.title')).toBeNull();
    expect(fieldText(r, 'toString.x.y')).toBeNull();
    expect(withFieldText(r, 'constructor.x.title', 'x')).toBeNull();
  });
  it('resolves an entry id that contains a dot', () => {
    const r = { ...resume(), experience: [{ ...resume().experience[0], id: 'a.b' }] };
    expect(fieldText(r, 'experience.a.b.achievements')).toBe('• Built a report\nCut costs by 5%');
  });
  it('applies a proofread fix only while its wording is still there', () => {
    expect(applyProofread(resume(), { field: 'summary', before: 'manager', after: 'lead' })!.summary).toBe('Project lead.');
    expect(applyProofread(resume(), { field: 'summary', before: 'director', after: 'lead' })).toBeNull();
    expect(applyProofread(resume(), { field: 'summary', before: '', after: 'lead' })).toBeNull();
  });
  it('splits bullets without markers or blank lines', () => {
    expect(bulletsOf('• Built a report\n\n- Cut costs\n* Ran')).toEqual(['Built a report', 'Cut costs', 'Ran']);
  });
});

describe('proofread fixes on achievements', () => {
  it('applies a fix inside one achievements field and leaves the rest of the CV alone', () => {
    const r = resume();
    const next = applyProofread(r, { field: 'experience.r1.achievements', before: 'Built a report', after: 'Built a weekly report' })!;
    expect(next.experience[0].achievements).toBe('• Built a weekly report\nCut costs by 5%');
    expect(next.volunteering[0].achievements).toBe('Coached 8 students');
    expect(next.summary).toBe(r.summary);
    expect(r.experience[0].achievements).toBe('• Built a report\nCut costs by 5%');
    expect(applyProofread(r, { field: 'volunteering.v1.achievements', before: 'Coached 8', after: 'Coached eight' })!.volunteering[0].achievements).toBe('Coached eight students');
    expect(applyProofread(r, { field: 'experience.r1.achievements', before: 'Built a dashboard', after: 'Built a chart' })).toBeNull();
    expect(applyProofread(r, { field: 'experience.zz.achievements', before: 'Built a report', after: 'Made a report' })).toBeNull();
  });
});
