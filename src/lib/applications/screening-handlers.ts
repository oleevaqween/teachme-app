import { z } from 'zod';
import { localRequest, readBody } from '@/lib/cv-studio/http';
import { applicationError } from './handlers';
import { ScreeningAnswersSchema } from './screening';
import type { ScreeningRepository } from './screening-repository';

/** GET and PUT /api/screening; local requests only, like the other APIs. */
export function createScreeningHandlers(deps: { screening: ScreeningRepository }) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        localRequest(request);
        return Response.json(await deps.screening.get(), { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return applicationError(error); }
    },
    async PUT(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const body = z.object({ answers: ScreeningAnswersSchema, revision: z.number().int().min(0) }).parse(await readBody(request));
        return Response.json(await deps.screening.save(body.answers, body.revision));
      } catch (error) { return applicationError(error); }
    },
  };
}
