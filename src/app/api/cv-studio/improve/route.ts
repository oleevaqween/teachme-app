import { z } from 'zod';
import { WorkspaceSchema } from '@/lib/cv-studio/schema';
import { improveQuestions, improveSuggestions } from '@/lib/cv-studio/improve';
import { apiError, localRequest, readBody } from '@/lib/cv-studio/http';

export const maxDuration = 300;
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = z.object({ workspace: WorkspaceSchema, action: z.enum(['questions', 'suggest']), target: z.string().max(120) }).parse(await readBody(request));
    const result = body.action === 'questions'
      ? await improveQuestions(body.workspace, body.target, request.signal)
      : await improveSuggestions(body.workspace, body.target, request.signal);
    return Response.json({ result });
  } catch (e) { return apiError(e); }
}
