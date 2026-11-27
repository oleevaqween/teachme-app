import { describe, expect, it } from 'vitest';
import { ApplicationInputSchema, applicationStatuses, blankApplicationInput, DATE_FORMAT, isWebLink, statusLabels, toInput, TrackedApplicationSchema, withWebScheme } from './schema';

describe('isWebLink', () => {
  it('accepts http and https links only', () => {
    expect(isWebLink('https://jobs.example.com/123')).toBe(true);
    expect(isWebLink('http://example.com')).toBe(true);
    expect(isWebLink('javascript:alert(1)')).toBe(false);
    expect(isWebLink('ftp://example.com')).toBe(false);
    expect(isWebLink('not a link')).toBe(false);
  });
});

describe('withWebScheme', () => {
  it('adds https:// only when no scheme is present', () => {
    expect(withWebScheme('linkedin.com/jobs/1')).toBe('https://linkedin.com/jobs/1');
    expect(withWebScheme('https://x.com')).toBe('https://x.com');
    expect(withWebScheme('http://x.com')).toBe('http://x.com');
    expect(withWebScheme('javascript:alert(1)')).toBe('javascript:alert(1)');
  });

  it('trims and turns blank input into an empty string', () => {
    expect(withWebScheme('')).toBe('');
    expect(withWebScheme('   ')).toBe('');
    expect(withWebScheme('  linkedin.com/jobs/1  ')).toBe('https://linkedin.com/jobs/1');
  });
});

describe('ApplicationInputSchema', () => {
  const valid = blankApplicationInput({ company: ' Acme ', role: 'Project Manager' });

  it('trims and accepts a minimal outside application', () => {
    const parsed = ApplicationInputSchema.parse(valid);
    expect(parsed.company).toBe('Acme');
    expect(parsed.status).toBe('applied');
    expect(parsed.workspaceId).toBeNull();
  });

  it('requires company and role with readable messages', () => {
    const result = ApplicationInputSchema.safeParse({ ...valid, company: '   ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Company is required.');
  });

  it('rejects unsafe job links and malformed emails, but allows them blank', () => {
    expect(ApplicationInputSchema.safeParse({ ...valid, jobUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(ApplicationInputSchema.safeParse({ ...valid, contact: { ...valid.contact, email: 'nope' } }).success).toBe(false);
    expect(ApplicationInputSchema.safeParse({ ...valid, jobUrl: '', contact: { ...valid.contact, email: '' } }).success).toBe(true);
    expect(ApplicationInputSchema.safeParse({ ...valid, contact: { ...valid.contact, email: 'recruiter@acme.com' } }).success).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(ApplicationInputSchema.safeParse({ ...valid, status: 'ghosted' }).success).toBe(false);
  });
});

describe('statuses', () => {
  it('has a label for every status in pipeline order', () => {
    expect(applicationStatuses.map(s => statusLabels[s])).toEqual(['Preparing', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn', 'No response']);
  });
});

describe('toInput', () => {
  it('drops server-owned fields', () => {
    const app = TrackedApplicationSchema.parse({
      ...blankApplicationInput({ company: 'Acme', role: 'PM' }),
      id: 'a1', history: [{ at: '2026-11-15T10:00:00.000Z', from: null, to: 'applied' }], createdAt: '2026-11-15T10:00:00.000Z',
    });
    const input = toInput(app);
    expect(input).not.toHaveProperty('id');
    expect(input).not.toHaveProperty('history');
    expect(input.company).toBe('Acme');
  });
});

describe('application hygiene fields', () => {
  const valid = blankApplicationInput({ company: 'Acme', role: 'PM' });

  it('accepts optional YYYY-MM-DD dates and refuses others with a plain message', () => {
    expect(ApplicationInputSchema.parse({ ...valid, postedOn: '2026-11-08', closesOn: '2026-11-30', appliedOn: '2026-11-18' }))
      .toMatchObject({ postedOn: '2026-11-08', closesOn: '2026-11-30', appliedOn: '2026-11-18' });
    for (const bad of ['18/11/2026', '2026-02-30', '']) {
      expect(ApplicationInputSchema.safeParse({ ...valid, closesOn: bad }).error?.issues[0].message).toBe(DATE_FORMAT);
    }
    expect(DATE_FORMAT).toBe('Enter a date as YYYY-MM-DD.');
  });

  it('accepts screening overrides for known questions only, up to 500 characters', () => {
    expect(ApplicationInputSchema.safeParse({ ...valid, screening: { 'uk-right': 'Yes', salary: 'x'.repeat(500) } }).success).toBe(true);
    expect(ApplicationInputSchema.safeParse({ ...valid, screening: { pets: 'cat' } }).success).toBe(false);
    expect(ApplicationInputSchema.safeParse({ ...valid, screening: { salary: 'x'.repeat(501) } }).error?.issues[0].message).toBe('Answers must be 500 characters or fewer.');
  });

  it('drops empty screening overrides, and leaves screening out when nothing remains', () => {
    expect(ApplicationInputSchema.parse({ ...valid, screening: { 'uk-right': '', salary: '£60k' } }).screening).toEqual({ salary: '£60k' });
    expect(ApplicationInputSchema.parse({ ...valid, screening: { 'uk-right': '', notice: '   ' } })).not.toHaveProperty('screening');
  });

  it('never takes the sent record from the browser', () => {
    const parsed = ApplicationInputSchema.parse({ ...valid, sent: { checkedAt: '2026-11-18T09:00:00.000Z', failed: true } });
    expect(parsed).not.toHaveProperty('sent');
  });

  it('carries dates and overrides through toInput, and leaves old rows unchanged', () => {
    const base = { ...valid, id: 'a1', history: [], createdAt: '2026-11-15T10:00:00.000Z' };
    const old = TrackedApplicationSchema.parse(base);
    expect(Object.keys(toInput(old)).sort()).toEqual(['company', 'contact', 'jobUrl', 'location', 'notes', 'role', 'salary', 'status', 'workspaceId']);
    const full = TrackedApplicationSchema.parse({ ...base, postedOn: '2026-11-08', appliedOn: '2026-11-18', screening: { notice: 'One month' }, sent: { checkedAt: '2026-11-18T09:00:00.000Z' } });
    const input = toInput(full);
    expect(input).toMatchObject({ postedOn: '2026-11-08', appliedOn: '2026-11-18', screening: { notice: 'One month' } });
    expect(input).not.toHaveProperty('closesOn');
    expect(input).not.toHaveProperty('sent');
  });
});
