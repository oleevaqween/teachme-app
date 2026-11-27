import { z } from 'zod';
import { apiError, localRequest, readBody } from '@/lib/cv-studio/http';
import { OwnWordsSchema, ResumeSchema, SpellingVariantSchema } from '@/lib/cv-studio/schema';
import { checkCvSpelling } from '@/lib/cv-studio/spelling';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = z.object({ resume: ResumeSchema, spelling: SpellingVariantSchema.default('en-GB'), ownWords: OwnWordsSchema.default([]) }).parse(await readBody(request));
    return Response.json({ result: await checkCvSpelling(body.resume, body.spelling, body.ownWords) });
  } catch (e) { return apiError(e); }
}
