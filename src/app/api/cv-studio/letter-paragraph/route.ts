import { z } from 'zod';
import { REWRITE_FAILED, rewriteLetterParagraph } from '@/lib/cv-studio/ai';
import { apiError, localRequest, readBody } from '@/lib/cv-studio/http';
import { WorkspaceSchema } from '@/lib/cv-studio/schema';

export const maxDuration = 300;
export const runtime = 'nodejs';

const BodySchema = z.object({
  workspace: WorkspaceSchema,
  // Any whole number; rewriteLetterParagraph refuses one that is not a body paragraph.
  index: z.number().int(),
  instruction: z.string().trim().max(300).default(''),
});

export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = BodySchema.parse(await readBody(request));
    return Response.json({ result: await rewriteLetterParagraph(body.workspace, body.index, body.instruction, request.signal) });
  } catch (e) {
    if (e instanceof Error && e.message === REWRITE_FAILED) return Response.json({ error: e.message }, { status: 502 });
    return apiError(e);
  }
}
