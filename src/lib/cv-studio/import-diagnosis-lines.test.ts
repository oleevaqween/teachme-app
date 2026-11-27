import { describe, expect, it } from 'vitest';
import { checkCv } from './cv-checker';
import { emptyResume, type Resume } from './schema';
import { fixture } from './test-fixture';
import { FILLER_WORDS, MISSING_LIMIT, firstCheck, missingLines } from './import-diagnosis';

const NOW = new Date('2026-11-19T12:00:00Z');

/** Pasted CV text: the AI kept the job (reworded) but dropped a volunteering role, an award and a certificate. */
const SOURCE = [
  'Ada Okoro',
  'Senior Project Manager',
  'ada.okoro@example.com | +234 803 123 4567 | Lagos, Nigeria',
  'Professional Experience',
  'Senior Project Manager, Example Logistics Ltd, Lagos',
  'Jan 2020 – Present',
  'Led a team of 6 engineers to deliver the new payments platform on time.',
  'Cut monthly reporting time from 5 days to 2 by automating the finance pack.',
  'Volunteer Coordinator, Lagos Food Bank',
  'Organised weekend food drives for local families.',
  'Awards',
  'Winner, Lagos Business School Case Competition',
  'Certifications',
  'PRINCE2 Practitioner certificate, Axelos',
  'Skills',
  'Stakeholder management, risk management, budget control',
  'With all of the other things that were there',
  'References available on request',
].join('\n');

const DROPPED = [
  'Volunteer Coordinator, Lagos Food Bank',
  'Organised weekend food drives for local families.',
  'Winner, Lagos Business School Case Competition',
  'PRINCE2 Practitioner certificate, Axelos',
];

function imported(): Resume {
  return {
    ...emptyResume(),
    personal: { fullName: 'Ada Okoro', professionalTitle: 'Senior Project Manager', email: 'ada.okoro@example.com', phone: '+234 803 123 4567', location: 'Lagos, Nigeria', linkedin: '' },
    experience: [{ id: 'exp1', company: 'Example Logistics Ltd', title: 'Senior Project Manager', location: 'Lagos', startDate: 'Jan 2020', endDate: 'Present',
      achievements: 'Led 6 engineers delivering the new payments platform on time.\nCut monthly reporting from 5 days to 2 by automating the finance pack.' }],
    skills: 'Stakeholder management, risk management, budget control',
    references: 'Available on request.',
  };
}

describe('missingLines', () => {
  it('lists a dropped role, award and certificate, in original order', () => {
    expect(missingLines(SOURCE, imported())).toEqual({ lines: DROPPED, more: 0 });
  });
  it('does not list reworded lines whose words are mostly in the fields', () => {
    const { lines } = missingLines(SOURCE, imported());
    expect(lines).not.toContain('Led a team of 6 engineers to deliver the new payments platform on time.');
    expect(lines).not.toContain('Cut monthly reporting time from 5 days to 2 by automating the finance pack.');
    expect(lines).not.toContain('References available on request');
  });
  it('ignores headings, short lines, dates and filler-only lines', () => {
    // Checked against an empty CV, so any line with 3 meaningful words would be listed.
    const text = ['Professional Experience', 'Ada Okoro', 'Jan 2020 – Present', 'Lagos, NG', 'With all of the other things that were there', 'BSc, MSc', 'Skills'].join('\n');
    expect(missingLines(text, emptyResume())).toEqual({ lines: [], more: 0 });
    expect(missingLines('Senior Project Manager', emptyResume()).lines).toEqual(['Senior Project Manager']);
    expect(FILLER_WORDS.has('with')).toBe(true);
    expect(FILLER_WORDS.has('there')).toBe(true);
  });
  it('shrinks as the missing content is added to a field', () => {
    const withVolunteering: Resume = { ...imported(), volunteering: [{ id: 'vol1', role: 'Volunteer Coordinator', organisation: 'Lagos Food Bank', location: '', startDate: '', endDate: '', achievements: 'Organised weekend food drives for local families.' }] };
    expect(missingLines(SOURCE, withVolunteering).lines).toEqual(DROPPED.slice(2));
    const withAward: Resume = { ...withVolunteering, awards: 'Winner, Lagos Business School Case Competition' };
    expect(missingLines(SOURCE, withAward).lines).toEqual(DROPPED.slice(3));
    const complete: Resume = { ...withAward, certifications: 'PRINCE2 Practitioner (Axelos)' };
    expect(missingLines(SOURCE, complete)).toEqual({ lines: [], more: 0 });
  });
  it('matches whole words, ignoring case', () => {
    const resume: Resume = { ...emptyResume(), skills: 'MANAGEMENT of VENDORS and ONBOARDING' };
    expect(missingLines('Management of vendors and onboarding', resume).lines).toEqual([]);
    expect(missingLines('Manage vendor onboarding', resume).lines).toEqual(['Manage vendor onboarding']);
  });
  it('lists a repeated line once', () => {
    expect(missingLines('Confidential document prepared privately\nConfidential document prepared privately', emptyResume()).lines)
      .toEqual(['Confidential document prepared privately']);
  });
  it('shows at most 10 lines and counts the rest', () => {
    const names = ['Alder', 'Birch', 'Cedar', 'Damson', 'Elm', 'Fir', 'Gorse', 'Hazel', 'Ivy', 'Juniper', 'Larch', 'Maple', 'Oak'];
    const text = names.map(name => `Volunteered at ${name} community library weekly`).join('\n');
    expect(MISSING_LIMIT).toBe(10);
    const result = missingLines(text, emptyResume());
    expect(result.lines).toHaveLength(10);
    expect(result.lines[0]).toBe('Volunteered at Alder community library weekly');
    expect(result.lines[9]).toBe('Volunteered at Juniper community library weekly');
    expect(result.more).toBe(3);
    expect(missingLines(names.slice(0, 10).map(name => `Volunteered at ${name} community library weekly`).join('\n'), emptyResume()).more).toBe(0);
  });
  it('handles Windows line endings and blank text', () => {
    expect(missingLines('Volunteer Coordinator, Lagos Food Bank\r\nAwards\r\n', imported()).lines).toEqual(['Volunteer Coordinator, Lagos Food Bank']);
    expect(missingLines('', imported())).toEqual({ lines: [], more: 0 });
  });
});

describe('firstCheck', () => {
  it('uses the CV checker score and its "fix" findings, most points lost first, at most 3', () => {
    const resume = emptyResume();
    expect(firstCheck(resume, NOW)).toEqual({
      score: checkCv(resume, NOW).score,
      fixes: ['Add achievements to your experience', 'Add an email or phone number', 'Add your name'],
    });
  });
  it('leaves out "consider" findings even when they lose more points', () => {
    const check = checkCv(emptyResume(), NOW);
    expect(check.findings.some(f => f.level === 'consider' && f.pointsLost > 4)).toBe(true);
    expect(firstCheck(emptyResume(), NOW).fixes).not.toContain('Your CV is short');
  });
  it('lists fewer than 3 when there are fewer fixes, and none for a CV with nothing to fix', () => {
    const resume = fixture().resume;
    expect(firstCheck(resume, NOW)).toEqual({ score: checkCv(resume, NOW).score, fixes: ['Write a summary of at least 25 words'] });
    const done: Resume = { ...resume, summary: 'Project manager with eight years of experience leading delivery teams in logistics and payments, known for clear monthly reporting, steady budget control and calm stakeholder management across busy programmes.' };
    expect(firstCheck(done, NOW).fixes).toEqual([]);
  });
  it('lists fixes in points-lost order', () => {
    const fixes = checkCv(emptyResume(), NOW).findings.filter(f => f.level === 'fix');
    const points = firstCheck(emptyResume(), NOW).fixes.map(title => fixes.find(f => f.title === title)!.pointsLost);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });
});
