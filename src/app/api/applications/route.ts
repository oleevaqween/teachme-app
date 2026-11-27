import { getCareerClient } from '@/lib/career-db/client';
import { getRepository } from '@/lib/cv-studio/repository';
import { getApplicationRepository } from '@/lib/applications/repository';
import { createApplicationHandlers } from '@/lib/applications/handlers';
import { versionLabelReader } from '@/lib/applications/sent';

export const runtime = 'nodejs';

// Built per request so nothing opens the database at import or build time.
const handlers = () => createApplicationHandlers({
  applications: getApplicationRepository(),
  workspaces: () => getRepository().listReadable(),
  versions: versionLabelReader(getCareerClient()),
});

export async function GET(request: Request) { return handlers().GET(request); }
export async function POST(request: Request) { return handlers().POST(request); }
export async function PUT(request: Request) { return handlers().PUT(request); }
export async function DELETE(request: Request) { return handlers().DELETE(request); }
export async function PATCH(request: Request) { return handlers().PATCH(request); }
