import { getRepository } from '@/lib/cv-studio/repository';
import { generateQuestions, scoreAnswer, writeClaimQuestion } from '@/lib/practice/ai';
import { createPracticeHandlers } from '@/lib/practice/handlers';
import { getPracticeRepository } from '@/lib/practice/repository';

export const runtime = 'nodejs';

// Built per request so nothing opens a database at import or build time.
const handlers = () => createPracticeHandlers({
  practice: getPracticeRepository(),
  workspaces: getRepository(),
  ai: { score: scoreAnswer, generate: generateQuestions, claim: writeClaimQuestion },
});

export async function GET(request: Request) { return handlers().GET(request); }
export async function POST(request: Request) { return handlers().POST(request); }
