import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/lib/cv-studio/import-diagnosis', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/cv-studio/import-diagnosis')>();
  return { ...actual, missingLines: vi.fn(actual.missingLines), firstCheck: vi.fn(actual.firstCheck) };
});
import { firstCheck, missingLines, READ_ISSUES, type ImportDiagnosis, type ReadIssueId } from '@/lib/cv-studio/import-diagnosis';
import { checkCv } from '@/lib/cv-studio/cv-checker';
import { emptyResume } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { ImportCheck } from './ImportCheck';
import { ImportModal } from './ImportModal';
import type { StudioController } from './useStudioController';

const NOW = new Date('2026-11-19T12:00:00Z');
const UNAVAILABLE = 'Import check unavailable.';
const TIP = 'When you apply, send a CV downloaded from CV Studio; it&#x27;s single-column and checked to read correctly.';
const resume = fixture().resume;
/** The fixture CV's text plus one line that never reached the fields. */
const SOURCE = 'Ada Okoro\nProject Manager\nManaged a budget of ₦2,000,000.\nVolunteer Coordinator, Lagos Food Bank';
const diagnosis = (...ids: ReadIssueId[]): ImportDiagnosis => ({ issues: ids.map(id => ({ id, ...READ_ISSUES[id] })) });
const render = (d: ImportDiagnosis | null | undefined, source = SOURCE, r = resume) =>
  renderToStaticMarkup(<ImportCheck diagnosis={d} sourceText={source} resume={r} now={NOW} />);
/** The markup of one part: from its heading to the next part's heading (or the end). */
function part(html: string, heading: string) {
  const start = html.indexOf(`<h4>${heading}</h4>`);
  const next = html.indexOf('<h4>', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}

describe('Import check: how cleanly the CV was read', () => {
  it('shows the box with its three parts in order', () => {
    const html = render(diagnosis());
    expect(html).toContain('Import check</h3>');
    const order = ['How cleanly your CV was read', 'Possibly missing from the fields', 'First check'].map(h => html.indexOf(`<h4>${h}</h4>`));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('says the CV was read cleanly when nothing was found', () => {
    const read = part(render(diagnosis()), 'How cleanly your CV was read');
    expect(read).toContain('Your CV was read cleanly.');
    expect(read).not.toContain('When you apply');
  });
  it('shows each problem with its title and advice, and the CV Studio tip for layout problems', () => {
    const read = part(render(diagnosis('scrambled', 'contact')), 'How cleanly your CV was read');
    expect(read).toContain('<strong>Scrambled layout</strong>');
    expect(read).toContain('Parts of this CV may have come out in the wrong order or split into fragments, which often happens with two-column or designed layouts. Check the fields carefully against your original.');
    expect(read).toContain('<strong>No email or phone found</strong>');
    expect(read).toContain(TIP);
    expect(read).not.toContain('Your CV was read cleanly.');
  });
  it.each(['scanned', 'characters'] as const)('adds the CV Studio tip for %s', id => {
    expect(part(render(diagnosis(id)), 'How cleanly your CV was read')).toContain(TIP);
  });
  it('leaves the tip out for contact and heading problems alone', () => {
    const read = part(render(diagnosis('contact', 'experience')), 'How cleanly your CV was read');
    expect(read).toContain('<strong>No experience section recognised</strong>');
    expect(read).not.toContain('When you apply');
  });
  it('says the check is unavailable when the server sent none, and still shows parts 2 and 3', () => {
    for (const d of [null, undefined]) {
      const html = render(d);
      expect(part(html, 'How cleanly your CV was read')).toContain(UNAVAILABLE);
      expect(part(html, 'Possibly missing from the fields')).toContain('Volunteer Coordinator, Lagos Food Bank');
      expect(part(html, 'First check')).toContain('Score: ');
    }
  });
});

describe('Import check: possibly missing from the fields', () => {
  it('lists original lines missing from the fields with the note', () => {
    const missing = part(render(diagnosis()), 'Possibly missing from the fields');
    expect(missing).toContain('Add anything that belongs in your CV before saving.');
    expect(missing).toContain('<li>Volunteer Coordinator, Lagos Food Bank</li>');
    expect(missing).not.toMatch(/and \d+ more/);
  });
  it('says everything appears when nothing is missing', () => {
    const complete = { ...resume, volunteering: [{ id: 'vol1', role: 'Volunteer Coordinator', organisation: 'Lagos Food Bank', location: '', startDate: '', endDate: '', achievements: '' }] };
    const missing = part(render(diagnosis(), SOURCE, complete), 'Possibly missing from the fields');
    expect(missing).toContain('Everything in your original appears in the fields.');
    expect(missing).not.toContain('<li>');
  });
  it('shows at most 10 lines and "and N more"', () => {
    const source = Array.from({ length: 12 }, (_, i) => `Volunteered at branch ${'abcdefghijkl'[i]}xx community library weekly`).join('\n');
    const missing = part(render(diagnosis(), source), 'Possibly missing from the fields');
    expect(missing.match(/<li>/g)).toHaveLength(10);
    expect(missing).toContain('and 2 more');
  });
  it('shows unavailable in this part only when it fails', () => {
    vi.mocked(missingLines).mockImplementationOnce(() => { throw new Error('broken'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = render(diagnosis());
    warn.mockRestore();
    expect(part(html, 'Possibly missing from the fields')).toContain(UNAVAILABLE);
    expect(part(html, 'How cleanly your CV was read')).toContain('Your CV was read cleanly.');
    expect(part(html, 'First check')).toContain('Score: ');
  });
});

describe('Import check: first check', () => {
  it('shows the checker score, up to 3 fixes and the note', () => {
    const first = part(render(diagnosis(), SOURCE, emptyResume()), 'First check');
    expect(first).toContain(`Score: ${checkCv(emptyResume(), NOW).score} out of 100`);
    expect(first).toContain('<strong>Add achievements to your experience</strong>');
    expect(first).toContain('<strong>Add an email or phone number</strong>');
    expect(first).toContain('<strong>Add your name</strong>');
    expect(first).not.toContain('Add a professional headline');
    expect(first).toContain('The full checker, including spelling, is in CV Studio after you save.');
  });
  it('shows unavailable in this part only when it fails', () => {
    vi.mocked(firstCheck).mockImplementationOnce(() => { throw new Error('broken'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = render(diagnosis());
    warn.mockRestore();
    expect(part(html, 'First check')).toContain(UNAVAILABLE);
    expect(part(html, 'First check')).not.toContain('Score: ');
    expect(part(html, 'Possibly missing from the fields')).toContain('Volunteer Coordinator, Lagos Food Bank');
  });
});

describe('Import review screen', () => {
  const noop = () => {};
  const controller = (imported: StudioController['imported']) => ({
    setImportOpen: noop, imported, busy: '', aiBusy: false, abort: { current: null }, error: '', setImported: noop, run: noop, create: noop,
    setTab: noop, importFile: null, setImportFile: noop, importText: '', setImportText: noop, importCV: noop,
  } as unknown as StudioController);

  it('puts the Import check above the fields', () => {
    const html = renderToStaticMarkup(<ImportModal c={controller({ resume, sourceText: SOURCE, diagnosis: diagnosis() })} />);
    expect(html).toContain('Review the imported record');
    expect(html.indexOf('Import check</h3>')).toBeGreaterThan(-1);
    expect(html.indexOf('Import check</h3>')).toBeLessThan(html.indexOf('<fieldset'));
    expect(html).toContain('Your CV was read cleanly.');
  });
  it('shows unavailable when the import reply has no diagnosis', () => {
    const html = renderToStaticMarkup(<ImportModal c={controller({ resume, sourceText: SOURCE })} />);
    expect(part(html, 'How cleanly your CV was read')).toContain(UNAVAILABLE);
  });
  it('shows no Import check before anything is imported', () => {
    expect(renderToStaticMarkup(<ImportModal c={controller(null)} />)).not.toContain('Import check');
  });
});
