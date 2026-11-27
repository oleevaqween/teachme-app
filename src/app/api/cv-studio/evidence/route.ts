import { parseCV } from '@/lib/interview-engine/cv-refiner';
import { apiError, localRequest, readBytes } from '@/lib/cv-studio/http';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    localRequest(request);
    const bytes = await readBytes(request, 6 * 1024 * 1024);
    const form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024 || !/\.(pdf|docx|txt)$/i.test(file.name)) throw new Error('Choose a text-based PDF, DOCX or UTF-8 TXT file up to 5 MB.');
    const text = /\.txt$/i.test(file.name) ? new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) : (await parseCV(file)).rawText;
    if (!text.trim() || text.includes('\u0000')) throw new Error('No readable text was found. For a scanned document or image, type or paste the relevant facts instead.');
    if (text.length > 65000) throw new Error('This document is too long. Upload a shorter extract or paste the relevant passage.');
    // No AI call, binary persistence or database write. The user chooses what to retain.
    return Response.json({ name: file.name.slice(0, 300), text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
