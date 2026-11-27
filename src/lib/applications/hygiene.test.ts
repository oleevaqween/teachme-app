import { describe, expect, it } from 'vitest';
import { APPLY_SOON, applyNudge, dayLabel, daysBetween, LOOKUP_FAILED, localDate, NO_DOWNLOAD, NOT_LINKED, sentView } from './hygiene';

describe('local dates', () => {
  it('gives YYYY-MM-DD in local time', () => {
    expect(localDate(new Date(2026, 10, 18, 23, 59))).toBe('2026-11-18');
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
  it('counts whole days between two dates, across clock changes', () => {
    expect(daysBetween('2026-11-08', '2026-11-18')).toBe(10);
    expect(daysBetween('2026-11-18', '2026-11-15')).toBe(-3);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
});

describe('applyNudge', () => {
  const today = '2026-11-18';
  const preparing = (dates: { postedOn?: string; closesOn?: string }) => applyNudge({ status: 'preparing', ...dates }, today);

  it('says when the job was posted', () => {
    expect(preparing({ postedOn: '2026-11-18' })).toBe('Posted today');
    expect(preparing({ postedOn: '2026-11-17' })).toBe('Posted 1 day ago');
    expect(preparing({ postedOn: '2026-11-15' })).toBe('Posted 3 days ago');
  });

  it('says when it closes, joined with a middle dot', () => {
    expect(preparing({ postedOn: '2026-11-15', closesOn: '2026-11-25' })).toBe('Posted 3 days ago · closes in 7 days');
    expect(preparing({ postedOn: '2026-11-15', closesOn: '2026-11-19' })).toBe('Posted 3 days ago · closes in 1 day');
    expect(preparing({ postedOn: '2026-11-15', closesOn: '2026-11-18' })).toBe('Posted 3 days ago · closes today');
    expect(preparing({ postedOn: '2026-11-15', closesOn: '2026-11-16' })).toBe('Posted 3 days ago · closed 2 days ago');
  });

  it('starts with a capital when only the closing date is known', () => {
    expect(preparing({ closesOn: '2026-11-21' })).toBe('Closes in 3 days');
    expect(preparing({ closesOn: '2026-11-18' })).toBe('Closes today');
    expect(preparing({ closesOn: '2026-11-17' })).toBe('Closed 1 day ago');
  });

  it('adds the apply-soon sentence from 7 days after posting', () => {
    expect(preparing({ postedOn: '2026-11-12' })).toBe('Posted 6 days ago');
    expect(preparing({ postedOn: '2026-11-11' })).toBe(`Posted 7 days ago. ${APPLY_SOON}`);
    expect(preparing({ postedOn: '2026-11-01', closesOn: '2026-11-20' })).toBe(`Posted 17 days ago · closes in 2 days. ${APPLY_SOON}`);
    expect(APPLY_SOON).toBe('Many employers review applications as they arrive; apply soon if you can.');
  });

  it('ignores a posted date in the future, and says nothing without dates or outside Preparing', () => {
    expect(preparing({ postedOn: '2026-11-20' })).toBeNull();
    expect(preparing({ postedOn: '2026-11-20', closesOn: '2026-11-30' })).toBe('Closes in 12 days');
    expect(preparing({})).toBeNull();
    expect(applyNudge({ status: 'applied', postedOn: '2026-11-01', closesOn: '2026-11-30' }, today)).toBeNull();
  });
});

describe('dayLabel', () => {
  it('uses fixed English month names, so September is Sep', () => {
    expect(dayLabel(new Date(2026, 8, 5, 12).toISOString())).toBe('5 Sep 2026');
    expect(dayLabel(new Date(2026, 0, 31, 12).toISOString())).toBe('31 Jan 2026');
    expect(dayLabel(new Date(2026, 11, 1, 12).toISOString())).toBe('1 Dec 2026');
  });
});

describe('sentView', () => {
  // Built from local parts so the day label is the same in every time zone.
  const at = new Date(2026, 10, 17, 12).toISOString();
  const checkedAt = '2026-11-18T09:00:00.000Z';
  const cv = { versionId: 'v1', label: 'Exported cv PDF', at };
  const letter = { versionId: 'v2', label: 'Exported letter DOCX', at };

  it('names each download by its format and date, only the parts found', () => {
    expect(sentView('cv-1', { cv, letter, checkedAt })).toEqual({ line: 'Sent: CV PDF downloaded 17 Nov 2026 · letter DOCX downloaded 17 Nov 2026', message: null });
    expect(sentView('cv-1', { cv, checkedAt })).toEqual({ line: 'Sent: CV PDF downloaded 17 Nov 2026', message: null });
  });

  it('explains a missing download, a failed check and an unlinked application', () => {
    expect(sentView('cv-1', { checkedAt })).toEqual({ line: null, message: NO_DOWNLOAD });
    expect(sentView('cv-1', { letter, checkedAt })).toEqual({ line: 'Sent: letter DOCX downloaded 17 Nov 2026', message: NO_DOWNLOAD });
    expect(sentView('cv-1', { checkedAt, failed: true })).toEqual({ line: null, message: LOOKUP_FAILED });
    expect(sentView(null, undefined)).toEqual({ line: null, message: NOT_LINKED });
    expect(sentView('cv-1', undefined)).toEqual({ line: null, message: null });
    expect([NO_DOWNLOAD, LOOKUP_FAILED, NOT_LINKED]).toEqual([
      'No downloaded CV found for this application. Download it from CV Studio before you send it.',
      'Could not check your downloads; press Use my latest download to try again.',
      'Link this application to a CV in CV Studio to record what you sent.',
    ]);
  });
});
