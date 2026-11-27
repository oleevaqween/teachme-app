import { describe, expect, it } from 'vitest';
import type { Analysis, Workspace } from './schema';
import { fixture } from './test-fixture';
import { downloadFileName, sourceLabel, targetLabel } from './plain-labels';

const base = fixture();
const w: Workspace = {
  ...base,
  resume: {
    ...base.resume,
    personal: { ...base.resume.personal, fullName: 'Adaeze Nwankwo' },
    experience: [{ id: 'exp1', company: 'Acme', title: 'Project Manager', location: '', startDate: '', endDate: '', achievements: '' }],
    education: [{ id: 'edu1', degree: 'BSc Computer Science', institution: 'UNILAG', graduationYear: '2015' }],
  },
};

describe('sourceLabel', () => {
  it('names CV sections in plain words', () => {
    expect(sourceLabel('summary', w)).toBe('Your summary');
    expect(sourceLabel('notes', w)).toBe('Your notes');
    expect(sourceLabel('company', w)).toBe('About the employer');
  });

  it('names roles and education by their title and organisation', () => {
    expect(sourceLabel('experience.exp1', w)).toBe('Your role: Project Manager at Acme');
    expect(sourceLabel('education.edu1', w)).toBe('Your education: BSc Computer Science, UNILAG');
  });

  it('never shows raw IDs for entries that no longer exist', () => {
    expect(sourceLabel('experience.gone', w)).toBe('One of your past roles');
    expect(sourceLabel('answer.3f2a-uuid', w)).toBe('One of your follow-up answers');
    expect(sourceLabel('document.a.b', w)).toBe('A document you added');
  });
});

describe('targetLabel', () => {
  it('describes what a suggestion changes', () => {
    expect(targetLabel('skills', w)).toBe('Skills');
    expect(targetLabel('experience.exp1.achievements', w)).toBe('Experience · Project Manager at Acme');
  });
});

describe('downloadFileName', () => {
  const day = new Date(2026, 10, 15);

  it('includes person, role, company, document type and date', () => {
    const tailored = { ...w, kind: 'application' as const, analysis: { role: 'Project Manager', company: 'Acme & Co.' } as Analysis };
    expect(downloadFileName(tailored, 'cv', 'pdf', day)).toBe('Adaeze-Nwankwo_Project-Manager_Acme-Co_CV_2026-11-15.pdf');
    expect(downloadFileName(tailored, 'letter', 'docx', day)).toBe('Adaeze-Nwankwo_Project-Manager_Acme-Co_Cover-letter_2026-11-15.docx');
  });

  it('falls back to the application name before analysis, and to just the person for a master CV', () => {
    expect(downloadFileName({ ...w, kind: 'application', name: 'Bank PM role', analysis: null }, 'cv', 'txt', day)).toBe('Adaeze-Nwankwo_Bank-PM-role_CV_2026-11-15.txt');
    expect(downloadFileName({ ...w, kind: 'master', analysis: null }, 'cv', 'pdf', day)).toBe('Adaeze-Nwankwo_CV_2026-11-15.pdf');
  });

  it('still produces a usable name when fields are empty', () => {
    const blank = { ...w, kind: 'master' as const, analysis: null, resume: { ...w.resume, personal: { ...w.resume.personal, fullName: '' } } };
    expect(downloadFileName(blank, 'cv', 'pdf', day)).toBe('CV_2026-11-15.pdf');
  });
});

describe('labels for the extra sections', () => {
  it('names new evidence sources in plain English', () => {
    const w = fixture();
    w.resume.volunteering = [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: '' }];
    expect(sourceLabel('volunteering.v1', w)).toBe('Your volunteering: Mentor at Code Club');
    expect(sourceLabel('volunteering.gone', w)).toBe('Your volunteering');
    expect(sourceLabel('languages', w)).toBe('Your languages');
    expect(sourceLabel('references', w)).toBe('Your references');
  });
});
