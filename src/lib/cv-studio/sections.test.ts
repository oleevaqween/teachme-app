import { describe, it, expect } from 'vitest';
import { emptyResume } from './schema';
import {
  addSection, availableSections, coreSectionKeys, formatLanguage, removeSection, repairOrder, sectionDescriptions,
  sectionHasContent, sectionKeys, sectionLabels, sectionNames, type SectionKey,
} from './sections';

describe('section helpers', () => {
  it('lists the 7 original sections first, then the 8 new ones', () => {
    expect(sectionKeys).toEqual(['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'additional',
      'volunteering', 'languages', 'awards', 'training', 'publications', 'strengths', 'interests', 'references']);
    expect(coreSectionKeys).toEqual(sectionKeys.slice(0, 7));
  });

  it('keeps the original CV headings and adds the new ones', () => {
    expect(sectionLabels).toEqual({
      summary: 'Profile', experience: 'Experience', projects: 'Selected projects', education: 'Education', skills: 'Skills',
      certifications: 'Certifications', additional: 'Additional information', volunteering: 'Volunteering', languages: 'Languages',
      awards: 'Awards & achievements', training: 'Training & courses', publications: 'Publications & talks', strengths: 'Strengths',
      interests: 'Interests', references: 'References',
    });
    for (const key of sectionKeys) {
      expect(sectionNames[key]).toBeTruthy();
      expect(sectionDescriptions[key]).toBeTruthy();
    }
  });

  it('detects content in text and entry sections', () => {
    const r = emptyResume();
    for (const key of sectionKeys) expect(sectionHasContent(r, key)).toBe(false);
    expect(sectionHasContent({ ...r, awards: '   ' }, 'awards')).toBe(false);
    expect(sectionHasContent({ ...r, awards: 'Prize' }, 'awards')).toBe(true);
    expect(sectionHasContent({ ...r, languages: [{ id: 'l1', language: 'Yoruba', level: '' }] }, 'languages')).toBe(true);
    expect(sectionHasContent({ ...r, volunteering: [{ id: 'v1', role: 'Mentor', organisation: '', location: '', startDate: '', endDate: '', achievements: '' }] }, 'volunteering')).toBe(true);
  });

  it('does not count rows left completely blank as content', () => {
    const r = emptyResume();
    expect(sectionHasContent({ ...r, languages: [{ id: 'l1', language: '  ', level: '' }] }, 'languages')).toBe(false);
    expect(sectionHasContent({ ...r, volunteering: [{ id: 'v1', role: ' ', organisation: '', location: '', startDate: '', endDate: '', achievements: '\n ' }] }, 'volunteering')).toBe(false);
    expect(sectionHasContent({ ...r, experience: [{ id: 'x1', title: '', company: '', location: '', startDate: '', endDate: '', achievements: '' }] }, 'experience')).toBe(false);
    expect(sectionHasContent({ ...r, education: [{ id: 'd1', degree: '', institution: ' ', graduationYear: '' }] }, 'education')).toBe(false);
    // Any filled field counts, so nothing typed is ever hidden by removing its section.
    expect(sectionHasContent({ ...r, languages: [{ id: 'l1', language: '', level: 'Fluent' }] }, 'languages')).toBe(true);
    expect(sectionHasContent({ ...r, volunteering: [{ id: 'v1', role: '', organisation: '', location: '', startDate: 'Jan 2020', endDate: '', achievements: '' }] }, 'volunteering')).toBe(true);
    expect(sectionHasContent({ ...r, languages: [{ id: 'l1', language: '', level: '' }, { id: 'l2', language: 'Igbo', level: '' }] }, 'languages')).toBe(true);
    expect(removeSection(['summary', 'languages'], { ...r, languages: [{ id: 'l1', language: '', level: '' }] }, 'languages')).toEqual(['summary']);
  });

  it('adds a section at the end once', () => {
    const order: SectionKey[] = ['summary', 'experience'];
    expect(addSection(order, 'languages')).toEqual(['summary', 'experience', 'languages']);
    expect(addSection(['summary', 'languages'], 'languages')).toEqual(['summary', 'languages']);
    expect(order).toEqual(['summary', 'experience']);
  });

  it('removes only an empty section', () => {
    const r = emptyResume();
    expect(removeSection(['summary', 'awards'], r, 'awards')).toEqual(['summary']);
    expect(() => removeSection(['summary', 'awards'], { ...r, awards: 'Prize' }, 'awards')).toThrow('Clear this section before removing it.');
  });

  it('offers the sections a CV does not use, in default order', () => {
    expect(availableSections([...coreSectionKeys])).toEqual(['volunteering', 'languages', 'awards', 'training', 'publications', 'strengths', 'interests', 'references']);
    expect(availableSections(['experience'])[0]).toBe('summary');
    expect(availableSections([...sectionKeys])).toEqual([]);
  });

  it('repairs an order that leaves out a section with content', () => {
    const r = { ...emptyResume(), references: 'Available on request', skills: 'Excel' };
    expect(repairOrder(['summary'], r)).toEqual(['summary', 'skills', 'references']);
    expect(repairOrder(['summary', 'references'], r)).toEqual(['summary', 'references', 'skills']);
    expect(repairOrder([...coreSectionKeys], emptyResume())).toEqual([...coreSectionKeys]);
  });

  it('formats a language with or without a level', () => {
    expect(formatLanguage({ language: ' French ', level: 'Professional working' })).toBe('French: Professional working');
    expect(formatLanguage({ language: 'Yoruba', level: '' })).toBe('Yoruba');
    expect(formatLanguage({ language: '  ', level: 'Fluent' })).toBe('');
  });
});
