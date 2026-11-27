import { z } from 'zod';
import { WorkspaceSchema, inputSignature, analysisSignature } from '@/lib/cv-studio/schema';
import { prepareApplication, preparePackage } from '@/lib/cv-studio/ai';
import { apiError, localRequest, readBody } from '@/lib/cv-studio/http';
export const maxDuration = 300;
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = z.object({ workspace: WorkspaceSchema, action: z.enum(['analyze', 'package']) }).parse(await readBody(request));
    if (body.workspace.jobDescription.trim().length < 60) throw new Error('Paste the full job requirements (at least 60 characters).');
    if (!body.workspace.resume.personal.fullName.trim()) throw new Error('Add your name and career evidence before preparing an application.');
    const result = body.action === 'analyze' ? await prepareApplication(body.workspace, request.signal) : await preparePackage(body.workspace, request.signal);
    return Response.json({ result, input: body.action === 'analyze' ? analysisSignature(body.workspace) : inputSignature(body.workspace) });
  } catch (e) { return apiError(e); }
}
