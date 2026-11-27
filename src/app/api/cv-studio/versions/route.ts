import { z } from 'zod';
import { getRepository } from '@/lib/cv-studio/repository';
import { apiError, localRequest } from '@/lib/cv-studio/http';
export async function GET(request: Request) {
  try {
    localRequest(request);
    const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).parse(new URL(request.url).searchParams.get('id'));
    return Response.json({ versions: await getRepository().versions(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return apiError(e); }
}

