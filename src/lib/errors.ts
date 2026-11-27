// src/lib/errors.ts

import { NextResponse } from 'next/server';

export class PlatformError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public userMessage: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export type ErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'FILE_CORRUPTED'
  | 'MAX_FILES_EXCEEDED'
  | 'PARSE_FAILURE'
  | 'VALIDATION_TIMEOUT'
  | 'LLM_UNAVAILABLE'
  | 'LLM_INVALID_KEY'
  | 'LLM_TIMEOUT'
  | 'INTERNET_SOURCE_UNAVAILABLE'
  | 'NO_QUESTIONS_AVAILABLE';

/**
 * Maps error codes to appropriate HTTP status codes.
 */
function getHttpStatus(code: ErrorCode): number {
  switch (code) {
    case 'UNSUPPORTED_FORMAT':
    case 'FILE_TOO_LARGE':
    case 'MAX_FILES_EXCEEDED':
      return 400;
    case 'LLM_INVALID_KEY':
      return 401;
    case 'FILE_CORRUPTED':
    case 'PARSE_FAILURE':
      return 422;
    case 'LLM_UNAVAILABLE':
    case 'INTERNET_SOURCE_UNAVAILABLE':
      return 503;
    case 'VALIDATION_TIMEOUT':
    case 'LLM_TIMEOUT':
      return 504;
    case 'NO_QUESTIONS_AVAILABLE':
      return 404;
    default:
      return 500;
  }
}

/**
 * Error boundary for API routes.
 * Catches PlatformError instances and returns structured JSON responses.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof PlatformError) {
    return NextResponse.json(
      { error: error.userMessage, code: error.code, retryable: error.retryable },
      { status: getHttpStatus(error.code) }
    );
  }
  // Unexpected errors — log and return generic message
  console.error('Unexpected error:', error);
  return NextResponse.json(
    { error: 'An unexpected error occurred. Please try again.', retryable: true },
    { status: 500 }
  );
}
