import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('@/lib/interview-engine/cv-refiner', () => ({ parseCV: mock.parse }));
import { POST } from '@/app/api/cv-studio/evidence/route';
function request(file: File, origin = 'http://localhost:3100') {
  const form = new FormData(); form.append('file', file);
  return new Request('http://localhost:3100/api/cv-studio/evidence', { method: 'POST', headers: { origin }, body: form });
}
describe('Local supporting-document extraction', () => {
  beforeEach(() => vi.resetAllMocks());
  it('extracts UTF-8 text without calling a model or document parser', async () => {
    const response = await POST(request(new File(['Managed ₦2,000,000.'], 'report.txt')));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'report.txt', text: 'Managed ₦2,000,000.' });
    expect(mock.parse).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['pdf', 'docx'])('extracts %s for review through the existing text parser', async ext => {
    mock.parse.mockResolvedValue({ rawText: 'Certificate of completion.' });
    const response = await POST(request(new File(['document'], 'certificate.' + ext)));
    expect(response.status).toBe(200);
    expect((await response.json()).text).toBe('Certificate of completion.');
  });
  it('rejects unsupported formats, oversized uploads and foreign origins', async () => {
    expect((await POST(request(new File(['image'], 'photo.png')))).status).toBe(400);
    expect((await POST(request(new File(['x'.repeat(5 * 1024 * 1024 + 1)], 'huge.txt')))).status).toBe(400);
    expect((await POST(request(new File(['facts'], 'report.txt'), 'https://evil.example'))).status).toBe(400);
    expect(mock.parse).not.toHaveBeenCalled();
  });
  it('rejects empty/scanned text, binary text and excessive extracted text', async () => {
    mock.parse.mockResolvedValue({ rawText: '' });
    expect((await (await POST(request(new File(['scan'], 'scan.pdf')))).json()).error).toContain('No readable text');
    expect((await POST(request(new File(['\u0000'], 'binary.txt')))).status).toBe(400);
    expect((await POST(request(new File(['x'.repeat(65001)], 'large.txt')))).status).toBe(400);
  });
  it('returns parser failures as errors without saving a partial extract', async () => {
    mock.parse.mockRejectedValue(new Error('Document could not be read.'));
    const response = await POST(request(new File(['broken'], 'broken.docx')));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Document could not be read.');
  });
});
