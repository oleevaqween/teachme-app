// src/app/api/interview/archive/route.ts

import { type NextRequest } from 'next/server';
import { validateRole } from '@/lib/validators/interview';
import {
  getArchive,
  archiveQuestion,
  unarchiveQuestion,
} from '@/lib/interview-engine';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/interview/archive?role=...
 * Returns archived questions for the specified role.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get('role');

    if (!role || typeof role !== 'string') {
      return Response.json(
        { error: 'Role query parameter is required.', code: 'VALIDATION_ERROR' },
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

    const archive = await getArchive(role.trim());

    return Response.json({ archive });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

/**
 * POST /api/interview/archive
 * Archives a question with the user's answer and score.
 * Body: { questionId, role, questionText, userAnswer, score }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { questionId, role, questionText, userAnswer, score } = body;

    // Validate required fields
    if (!questionId || typeof questionId !== 'string') {
      return Response.json(
        { error: 'questionId is required and must be a string.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!role || typeof role !== 'string') {
      return Response.json(
        { error: 'role is required and must be a string.', code: 'VALIDATION_ERROR' },
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

    if (!questionText || typeof questionText !== 'string') {
      return Response.json(
        { error: 'questionText is required and must be a string.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!userAnswer || typeof userAnswer !== 'string') {
      return Response.json(
        { error: 'userAnswer is required and must be a string.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (score === undefined || score === null || typeof score !== 'number' || score < 1 || score > 10) {
      return Response.json(
        { error: 'score is required and must be a number between 1 and 10.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const archived = await archiveQuestion(
      questionId,
      role.trim(),
      questionText,
      userAnswer,
      score
    );

    return Response.json({ archived }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/interview/archive
 * Unarchives a question by ID.
 * Body: { questionId }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { questionId } = body;

    if (!questionId || typeof questionId !== 'string') {
      return Response.json(
        { error: 'questionId is required and must be a string.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    await unarchiveQuestion(questionId);

    return Response.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
