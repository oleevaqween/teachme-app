// src/app/api/interview/questions/route.ts

import { type NextRequest } from 'next/server';
import { validateRole } from '@/lib/validators/interview';
import { getActiveProviderConfig } from '@/lib/llm/config';
import {
  generateMockQuestions,
  getArchivedQuestionIds,
} from '@/lib/interview-engine';
import { handleApiError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role } = body;

    // Validate role input
    if (!role || typeof role !== 'string') {
      return Response.json(
        { error: 'Role is required and must be a string.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const roleValidation = validateRole(role);
    if (!roleValidation.valid) {
      return Response.json(
        { error: roleValidation.error, code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Load active LLM provider
    const llmConfig = await getActiveProviderConfig();
    if (!llmConfig) {
      return Response.json(
        {
          error: 'No LLM provider configured. Please configure a provider in Settings.',
          code: 'LLM_UNAVAILABLE',
          retryable: false,
        },
        { status: 503 }
      );
    }

    // Get archived question IDs for exclusion
    const archivedIds = await getArchivedQuestionIds(role.trim());

    // Generate mock questions
    const questions = await generateMockQuestions(role.trim(), archivedIds, llmConfig);

    return Response.json({ questions });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
