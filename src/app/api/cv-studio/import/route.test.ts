import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ generate: vi.fn(), config: vi.fn(), parse: vi.fn() }));
vi.mock('ai', () => ({ generateText: mock.generate }));
vi.mock('@/lib/llm/config', () => ({ getActiveProviderConfig: mock.config }));
vi.mock('@/lib/llm/provider', () => ({ createProvider: () => ({ chat: () => 'test-model' }) }));
vi.mock('@/lib/interview-engine/cv-refiner', () => ({ parseCV: mock.parse }));
vi.mock('@/lib/cv-studio/import-diagnosis', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/cv-studio/import-diagnosis')>();
  return { ...actual, readQuality: vi.fn(actual.readQuality) };
});
import { POST } from './route';
import { readQuality } from '@/lib/cv-studio/import-diagnosis';
import { fixture } from '@/lib/cv-studio/test-fixture';

/** The fixture CV as a person would paste it: every number the import keeps is in the text. Form text arrives with CRLF line endings. */
const PASTED = [
  'Ada Okoro',
  'Project Manager',
  'ada@example.com | +234 800 000 0000 | Lagos, Nigeria',
  'Summary',
  'Project manager supporting delivery teams.',
  'Experience',
  'Project Manager, Example Ltd, Lagos, 2020 – 2024',
  'Managed a budget of ₦2,000,000.',
  'Prepared monthly reports for 4 stakeholders.',
  'Education',
  'BSc Management, Example University, 2019',
  'Skills',
  'Reporting, stakeholder management',
].join('\r\n');

function request(body: FormData) {
  return new Request('http://localhost:3100/api/cv-studio/import', { method: 'POST', headers: { origin: 'http://localhost:3100' }, body });
}
const pasted = (text: string) => { const form = new FormData(); form.append('text', text); return request(form); };
const upload = (name: string) => { const form = new FormData(); form.append('file', new File(['document'], name)); return request(form); };
const modelReturns = (value: unknown) => mock.generate.mockResolvedValueOnce({ text: JSON.stringify(value), finishReason: 'stop' });

describe('POST /api/cv-studio/import with the import check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.config.mockResolvedValue({ type: 'openai', model: 'test' });
  });

  it('returns the resume, the source text and a clean diagnosis for pasted text', async () => {
    modelReturns(fixture().resume);
    const response = await POST(pasted(PASTED));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resume: fixture().resume, sourceText: PASTED, diagnosis: { issues: [] } });
    expect(readQuality).toHaveBeenCalledWith(PASTED, { kind: 'text' });
    expect(mock.parse).not.toHaveBeenCalled();
  });

  it('checks a PDF with its page count and reports a scanned PDF', async () => {
    mock.parse.mockResolvedValue({ sections: [], rawText: PASTED, pages: 2 });
    modelReturns(fixture().resume);
    const body = await (await POST(upload('cv.pdf'))).json();
    expect(readQuality).toHaveBeenCalledWith(PASTED, { kind: 'pdf', pages: 2 });
    expect(body.resume).toEqual(fixture().resume);
    expect(body.diagnosis.issues.map((issue: { id: string }) => issue.id)).toEqual(['scanned']);
    expect(body.diagnosis.issues[0].title).toBe('Scanned or image PDF');
  });

  it('checks a Word file without the scanned-PDF check', async () => {
    mock.parse.mockResolvedValue({ sections: [], rawText: PASTED });
    modelReturns(fixture().resume);
    const body = await (await POST(upload('cv.docx'))).json();
    expect(readQuality).toHaveBeenCalledWith(PASTED, { kind: 'docx' });
    expect(body.diagnosis).toEqual({ issues: [] });
  });

  it('still returns the imported resume with diagnosis null when the check throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(readQuality).mockImplementationOnce(() => { throw new Error('check broke'); });
    modelReturns(fixture().resume);
    const response = await POST(pasted(PASTED));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resume: fixture().resume, sourceText: PASTED, diagnosis: null });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still refuses an import that introduces numbers, without running the check', async () => {
    modelReturns({ ...fixture().resume, summary: 'Delivered 999 projects.' });
    const response = await POST(pasted(PASTED));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('numbers');
    expect(readQuality).not.toHaveBeenCalled();
  });
});
