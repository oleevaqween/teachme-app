import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { localDate } from '@/lib/applications/hygiene';
import type { ApplicationRow } from '@/lib/applications/rows';
import { blankApplicationInput, toInput, type SavedApplication } from '@/lib/applications/schema';
import { HONESTY_NOTE, QUESTION_IDS, SCREENING_QUESTIONS, SCREENING_UNREADABLE } from '@/lib/applications/screening';
import { ApplicationPanel } from './ApplicationPanel';
import { ScreeningAnswersSection, ScreeningChecklist, SentRecord } from './HygieneParts';

const noop = () => {};
// Built from local parts so "17 Nov 2026" is the same in every time zone.
const at = new Date(2026, 10, 17, 12).toISOString();
const cvPdf = { versionId: 'v1', label: 'Exported cv PDF', at };
const letterPdf = { versionId: 'v2', label: 'Exported letter PDF', at };
const checkedAt = '2026-11-18T09:00:00.000Z';
const UK = 'Do you have the right to work in the UK?';
const US = 'Are you authorised to work in the US?';
const NG = 'Do you have the right to work in Nigeria?';

describe('what was sent', () => {
  it('shows the downloads with Open in CV Studio and Use my latest download', () => {
    const html = renderToStaticMarkup(<SentRecord workspaceId="cv-1" openHref="/cv-studio?open=cv-1" sent={{ cv: cvPdf, letter: letterPdf, checkedAt }} busy={false} onRefresh={noop} />);
    expect(html).toContain('Sent: CV PDF downloaded 17 Nov 2026 · letter PDF downloaded 17 Nov 2026');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('href="/cv-studio?open=cv-1"');
    expect(html).toContain('Open in CV Studio');
    expect(html).toMatch(/Use my latest download<\/button>/);
  });

  it('explains no download and a failed check, and asks to link an unlinked application', () => {
    expect(renderToStaticMarkup(<SentRecord workspaceId="cv-1" sent={{ checkedAt }} busy={false} onRefresh={noop} />))
      .toContain('No downloaded CV found for this application. Download it from CV Studio before you send it.');
    expect(renderToStaticMarkup(<SentRecord workspaceId="cv-1" sent={{ checkedAt, failed: true }} busy={false} onRefresh={noop} />))
      .toContain('Could not check your downloads; press Use my latest download to try again.');
    const unlinked = renderToStaticMarkup(<SentRecord workspaceId={null} sent={undefined} busy={false} onRefresh={noop} />);
    expect(unlinked).toContain('Link this application to a CV in CV Studio to record what you sent.');
    expect(unlinked).not.toContain('<button');
  });
});

describe('screening checklist', () => {
  it('prefills standard answers, shows overrides with Use my standard answer, under the honesty note', () => {
    const html = renderToStaticMarkup(<ScreeningChecklist market="us" standard={{ 'us-right': 'Yes, US citizen.', salary: 'Open' }} overrides={{ salary: '£60,000 for this role' }} onChange={noop} />);
    expect(html).toContain(HONESTY_NOTE);
    expect(html.indexOf(HONESTY_NOTE)).toBeLessThan(html.indexOf(US));
    expect(html.indexOf(US)).toBeLessThan(html.indexOf(UK));
    expect(html).toContain('>Yes, US citizen.</textarea>');
    expect(html).toContain('>£60,000 for this role</textarea>');
    expect(html).not.toContain('>Open</textarea>');
    expect(html.match(/Use my standard answer/g)).toHaveLength(1);
    expect(html.match(/maxLength="500"/g)).toHaveLength(10);
  });

  it('orders by market: Nigeria first for Nigeria, UK first with no market', () => {
    const ng = renderToStaticMarkup(<ScreeningChecklist market="nigeria" standard={{}} overrides={undefined} onChange={noop} />);
    expect(ng.indexOf(NG)).toBeLessThan(ng.indexOf(UK));
    const none = renderToStaticMarkup(<ScreeningChecklist standard={{}} overrides={undefined} onChange={noop} />);
    expect(none.indexOf(UK)).toBeLessThan(none.indexOf(US));
    expect(none).not.toContain('Use my standard answer');
  });
});

describe('screening answers section', () => {
  it('is collapsed by default and holds all ten questions in the standard order', () => {
    const html = renderToStaticMarkup(<ScreeningAnswersSection profile={{ answers: { notice: 'One month' }, revision: 3 }} onSaved={noop} />);
    expect(html.startsWith('<details')).toBe(true);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toMatch(/<summary[^>]*>Screening answers<\/summary>/);
    const positions = QUESTION_IDS.map(id => html.indexOf(SCREENING_QUESTIONS[id]));
    expect(positions.every(p => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain('>One month</textarea>');
    expect(html.match(/maxLength="500"/g)).toHaveLength(10);
  });

  it('says when the saved answers could not be read, and opens them empty', () => {
    const html = renderToStaticMarkup(<ScreeningAnswersSection profile={{ answers: {}, revision: 4, unreadable: true }} onSaved={noop} />);
    expect(SCREENING_UNREADABLE).toBe('Your saved screening answers could not be read. Saving will replace them.');
    expect(html).toContain(SCREENING_UNREADABLE);
    expect(html.match(/maxLength="500"/g)).toHaveLength(10);
    expect(renderToStaticMarkup(<ScreeningAnswersSection profile={{ answers: {}, revision: 4 }} onSaved={noop} />)).not.toContain(SCREENING_UNREADABLE);
  });
});

describe('application panel', () => {
  const daysFromToday = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDate(d); };
  const saved = (extra: Partial<SavedApplication>): SavedApplication => ({
    ...blankApplicationInput({ company: 'Acme', role: 'PM', workspaceId: 'cv-1' }),
    id: 'e1', history: [], createdAt: '2026-11-10T08:00:00.000Z', revision: 2, updatedAt: '2026-11-17T08:00:00.000Z', ...extra,
  });
  const rowOf = (entry: SavedApplication, market?: 'us'): ApplicationRow => ({
    key: entry.id, entry, draft: toInput(entry), workspaceId: entry.workspaceId, cvName: 'Acme PM', cvMissing: false, virtual: false, updatedAt: entry.updatedAt,
    ...(market ? { market } : {}),
  });
  const panel = (row: ApplicationRow) => renderToStaticMarkup(
    <ApplicationPanel target={{ mode: 'row', row }} cvOptions={[]} standardAnswers={{ 'us-right': 'Yes' }} onClose={noop} onChanged={noop} />,
  );

  it('shows the date inputs and the apply-early line for a Preparing application', () => {
    const html = panel(rowOf(saved({ status: 'preparing', postedOn: daysFromToday(-10), closesOn: daysFromToday(3) })));
    for (const label of ['Posted on', 'Closes on', 'Applied on']) expect(html).toContain(label);
    expect(html).toContain(`value="${daysFromToday(-10)}"`);
    expect(html).toContain('Posted 10 days ago · closes in 3 days. Many employers review applications as they arrive; apply soon if you can.');
    expect(html).not.toContain('Sent:');
  });

  it('shows what was sent for an Applied application, and the checklist in market order', () => {
    const html = panel(rowOf(saved({ status: 'applied', appliedOn: '2026-11-17', sent: { cv: cvPdf, letter: letterPdf, checkedAt } }), 'us'));
    expect(html).not.toContain('days ago');
    expect(html).toContain('Sent: CV PDF downloaded 17 Nov 2026 · letter PDF downloaded 17 Nov 2026');
    expect(html.match(/Open in CV Studio/g)).toHaveLength(1);
    expect(html).toContain('Use my latest download');
    expect(html).toContain(HONESTY_NOTE);
    expect(html.indexOf(US)).toBeLessThan(html.indexOf(UK));
    expect(html).toContain('>Yes</textarea>');
  });

  it('asks to link an outside Applied application', () => {
    const html = panel(rowOf(saved({ workspaceId: null, status: 'applied' })));
    expect(html).toContain('Link this application to a CV in CV Studio to record what you sent.');
    expect(html).not.toContain('Use my latest download');
  });
});
