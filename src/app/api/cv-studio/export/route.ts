import { z } from 'zod';
import { WorkspaceSchema, inputSignature } from '@/lib/cv-studio/schema';
import { exportDocument } from '@/lib/cv-studio/export';
import { apiError, localRequest, readBody } from '@/lib/cv-studio/http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    localRequest(request);
    if (new URL(request.url).searchParams.get('asset') !== 'pdf-worker') return new Response('Not found', { status: 404 });
    const worker = await readFile(join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8');
    return new Response(worker, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, max-age=3600' } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    localRequest(request);
    const { workspace, format, kind, delivery } = z.object({
      workspace: WorkspaceSchema, format: z.enum(['pdf','docx','txt']), kind: z.enum(['cv','letter']).default('cv'),
      delivery: z.enum(['file', 'json']).default('file'),
    }).parse(await readBody(request));
    if (kind === 'letter' && workspace.packageInput !== inputSignature(workspace)) throw new Error('Your CV or job changed. Regenerate the letter or confirm it against the current CV before exporting.');
    if (kind === 'letter' && !workspace.package?.coverLetterApproved) throw new Error('Review and approve every factual claim in the cover letter before exporting.');
    const result = await exportDocument(workspace, format, kind);
    const filename = (workspace.resume.personal.fullName + '-' + kind).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    const mediaType = format === 'pdf' ? 'application/pdf' : format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain; charset=utf-8';
    if (delivery === 'json') return Response.json({ contentBase64: result.buffer.toString('base64'), mediaType, verification: result.verification }, { headers: { 'Cache-Control': 'no-store' } });
    return new Response(new Uint8Array(result.buffer), { headers: {
      'Content-Type': mediaType,
      'Content-Disposition': 'attachment; filename="' + filename + '.' + format + '"',
      'X-Export-Verification': JSON.stringify(result.verification),
      'Cache-Control': 'no-store',
    } });
  } catch (e) { return apiError(e); }
}
