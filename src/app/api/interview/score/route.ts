import { scoreAnswer } from '@/lib/practice/ai';
import { createQuickScoreHandler } from '@/lib/quick-practice/handlers';

export const runtime = 'nodejs';

const handler = createQuickScoreHandler({ score: scoreAnswer });

export async function POST(request: Request) {
  return handler.POST(request);
}
