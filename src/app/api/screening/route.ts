import { createScreeningHandlers } from '@/lib/applications/screening-handlers';
import { getScreeningRepository } from '@/lib/applications/screening-repository';

export const runtime = 'nodejs';

// Built per request so nothing opens the database at import or build time.
const handlers = () => createScreeningHandlers({ screening: getScreeningRepository() });

export async function GET(request: Request) { return handlers().GET(request); }
export async function PUT(request: Request) { return handlers().PUT(request); }
