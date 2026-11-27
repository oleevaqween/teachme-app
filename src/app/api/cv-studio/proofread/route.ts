import { z } from 'zod';
import { apiError, localRequest, readBody } from '@/lib/cv-studio/http';
import { proofreadCv } from '@/lib/cv-studio/proofread';
import { WorkspaceSchema } from '@/lib/cv-studio/schema';

export const maxDuration = 300;
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = z.object({ workspace: WorkspaceSchema }).parse(await readBody(request));
    return Response.json({ result: await proofreadCv(body.workspace, request.signal) });
  } catch (e) { return apiError(e); }
}
