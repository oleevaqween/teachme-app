import { describe, expect, it } from 'vitest';
import { improveAnswerId } from '@/lib/cv-studio/improve-rules';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { claimEvidence, claimField, claimFromSearch, fallbackClaimQuestion, hasBullet, practiceClaimUrl } from './claims';

const resume = { ...fixture().resume, projects: '• Built a stakeholder tracker in Excel' };

describe('claim helpers', () => {
  it('maps a target to its CV field', () => {
    expect(claimField('experience.e1')).toBe('experience.e1.achievements');
    expect(claimField('volunteering.v1')).toBe('volunteering.v1.achievements');
    expect(claimField('projects')).toBe('projects');
  });
  it('finds a bullet only when it is still in the CV word for word', () => {
    expect(hasBullet(resume, 'experience.e1', 'Managed a budget of ₦2,000,000.')).toBe(true);
    expect(hasBullet(resume, 'experience.e1', '  Prepared monthly reports for 4 stakeholders.  ')).toBe(true);
    expect(hasBullet(resume, 'projects', 'Built a stakeholder tracker in Excel')).toBe(true);
    expect(hasBullet(resume, 'experience.e1', 'Managed a budget of ₦3,000,000.')).toBe(false);
    expect(hasBullet(resume, 'experience.gone', 'Managed a budget of ₦2,000,000.')).toBe(false);
  });
  it('writes the standard question with a full stop after the bullet', () => {
    expect(fallbackClaimQuestion('Cut costs by 10%').question).toBe('Walk me through this: Cut costs by 10%. What did you personally do, and how do you know it worked?');
    expect(fallbackClaimQuestion('Cut costs by 10%.').question).toBe('Walk me through this: Cut costs by 10%. What did you personally do, and how do you know it worked?');
    const long = fallbackClaimQuestion('a'.repeat(1500));
    expect(long.question.length).toBeLessThanOrEqual(1000);
    expect(long.guidance).toContain('what you personally did');
  });
  it('builds an Improve my CV answer from the claim', () => {
    const answer = claimEvidence({ target: 'experience.e1', bullet: 'Managed a budget of ₦2,000,000.', question: 'How did you track it?' }, '  I tracked it monthly in a shared sheet.  ', 'approximate');
    expect(answer).toEqual({
      id: improveAnswerId('experience.e1', 'How did you track it?'), target: 'experience.e1', bullet: 'Managed a budget of ₦2,000,000.',
      question: 'How did you track it?', answer: 'I tracked it monthly in a shared sheet.', number: 'approximate', status: 'answered',
    });
  });
  it('round-trips the practice link', () => {
    const url = practiceClaimUrl('app-1', 'experience.e1', 'Cut costs by 10% & more');
    expect(url.startsWith('/interview/practice/app-1?')).toBe(true);
    expect(claimFromSearch(url.slice(url.indexOf('?')))).toEqual({ target: 'experience.e1', bullet: 'Cut costs by 10% & more' });
    expect(claimFromSearch('?target=experience.e1')).toBeNull();
    expect(claimFromSearch('')).toBeNull();
  });
});

describe('volunteering claims', () => {
  it('finds a volunteering bullet word for word', () => {
    const withVolunteering = { ...resume, volunteering: [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: '• Ran 12 coding workshops\nWrote a beginner guide' }] };
    expect(hasBullet(withVolunteering, 'volunteering.v1', 'Ran 12 coding workshops')).toBe(true);
    expect(hasBullet(withVolunteering, 'volunteering.v1', 'Wrote a beginner guide')).toBe(true);
    expect(hasBullet(withVolunteering, 'volunteering.v1', 'Ran 13 coding workshops')).toBe(false);
    expect(hasBullet(withVolunteering, 'volunteering.v2', 'Ran 12 coding workshops')).toBe(false);
  });
});
