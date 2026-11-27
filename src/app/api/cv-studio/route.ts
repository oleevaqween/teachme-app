import { z } from 'zod';
import { WorkspaceSchema } from '@/lib/cv-studio/schema';
import { getRepository } from '@/lib/cv-studio/repository';
import { apiError, localRequest, readBody } from '@/lib/cv-studio/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    localRequest(request);
    const { workspaces, unreadable } = await getRepository().listReadable();
    if (unreadable.length) console.warn('[cv-studio] Skipped unreadable saved workspaces:', unreadable.join(', '));
    return Response.json({ workspaces, unreadable: unreadable.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return apiError(e); }
}
export async function PUT(request: Request) {
  try {
    localRequest(request);
    const body = z.object({ workspace: WorkspaceSchema, revision: z.number().int().min(0), checkpoint: z.string().max(120).optional() }).parse(await readBody(request));
    return Response.json(await getRepository().save(body.workspace, body.revision, body.checkpoint));
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request) {
  try {
    localRequest(request);
    const body = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), revision: z.number().int().positive() }).parse(await readBody(request));
    return Response.json(await getRepository().removeApplication(body.id, body.revision));
  } catch (e) { return apiError(e); }
}
