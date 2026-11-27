import { importResume } from '@/lib/cv-studio/ai';
import { parseCV } from '@/lib/interview-engine/cv-refiner';
import { apiError, localRequest, readBytes } from '@/lib/cv-studio/http';
import { readQuality, type ImportDiagnosis, type ReadSource } from '@/lib/cv-studio/import-diagnosis';
export const maxDuration = 180;
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    localRequest(request);
    if (Number(request.headers.get('content-length') || 0) > 6 * 1024 * 1024) throw new Error('Please upload a CV smaller than 5 MB.');
    const bytes = await readBytes(request, 6 * 1024 * 1024);
    const form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const file = form.get('file'), pasted = form.get('text');
    let text = typeof pasted === 'string' ? pasted : '';
    let source: ReadSource = { kind: 'text' };
    if (file instanceof File && file.size) {
      if (file.size > 5 * 1024 * 1024 || !/\.(pdf|docx)$/i.test(file.name)) throw new Error('Use a PDF or DOCX file up to 5 MB.');
      const parsed = await parseCV(file);
      text = parsed.rawText;
      source = /\.pdf$/i.test(file.name) ? { kind: 'pdf', pages: parsed.pages } : { kind: 'docx' };
    }
    if (text.length > 65000) throw new Error('This CV is too long to import in one pass. Paste the relevant career record.');
    const resume = await importResume(text, request.signal);
    return Response.json({ resume, sourceText: text, diagnosis: diagnose(text, source) });
  } catch (e) { return apiError(e); }
}
/** The read-quality advice; if it fails, the import still succeeds and the review screen says the check is unavailable. */
function diagnose(text: string, source: ReadSource): ImportDiagnosis | null {
  try {
    return { issues: readQuality(text, source) };
  } catch (error) {
    console.warn('Import check failed:', error);
    return null;
  }
}
