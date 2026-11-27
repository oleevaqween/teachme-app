import { z, ZodError } from 'zod';
import { ConflictError } from '@/lib/cv-studio/repository';
import { localRequest, readBody } from '@/lib/cv-studio/http';
import type { SavedWorkspace } from '@/lib/cv-studio/schema';
import type { ApplicationRepository } from './repository';
import { buildRows } from './rows';
import { ApplicationInputSchema } from './schema';
import { sentFinder, type ReadVersions } from './sent';

type Deps = {
  applications: ApplicationRepository;
  /** Read-only access to CV Studio workspaces. */
  workspaces: () => Promise<{ workspaces: SavedWorkspace[] }>;
  /** Read-only labels of a CV's saved versions, used to record which download was sent. */
  versions: ReadVersions;
};

const entryId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);

export function applicationError(error: unknown): Response {
  if (error instanceof ConflictError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? 'Please check the application details.' }, { status: 400 });
  return Response.json({ error: error instanceof Error ? error.message : 'The operation could not be completed.' }, { status: 400 });
}

export function createApplicationHandlers(deps: Deps) {
  const findSent = sentFinder(deps.versions);
  return {
    async GET(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const [{ workspaces }, { applications, unreadable }] = await Promise.all([deps.workspaces(), deps.applications.listReadable()]);
        if (unreadable.length) console.warn('[applications] Skipped unreadable tracker entries:', unreadable.join(', '));
        const { rows, cvOptions } = buildRows(applications, workspaces);
        return Response.json({ applications: rows, cvOptions, unreadable: unreadable.length }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return applicationError(error); }
    },
    async POST(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const body = z.object({ application: ApplicationInputSchema }).parse(await readBody(request));
        return Response.json(await deps.applications.create(body.application, new Date(), findSent), { status: 201 });
      } catch (error) { return applicationError(error); }
    },
    async PUT(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const body = z.object({ id: entryId, application: ApplicationInputSchema, revision: z.number().int().min(1) }).parse(await readBody(request));
        return Response.json(await deps.applications.update(body.id, body.application, body.revision, new Date(), findSent));
      } catch (error) { return applicationError(error); }
    },
    async DELETE(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const body = z.object({ id: entryId, revision: z.number().int().min(1) }).parse(await readBody(request));
        return Response.json(await deps.applications.remove(body.id, body.revision));
      } catch (error) { return applicationError(error); }
    },
    /** Use my latest download: records the newest CV and letter downloads again. */
    async PATCH(request: Request): Promise<Response> {
      try {
        localRequest(request);
        const body = z.object({ id: entryId, revision: z.number().int().min(1) }).parse(await readBody(request));
        return Response.json(await deps.applications.refreshSent(body.id, body.revision, findSent));
      } catch (error) { return applicationError(error); }
    },
  };
}
