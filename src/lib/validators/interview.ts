// src/lib/validators/interview.ts

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const MIN_ROLE_LENGTH = 2;
const MAX_ROLE_LENGTH = 100;

/**
 * Validates role input: 2-100 characters after trimming.
 */
export function validateRole(role: string): ValidationResult {
  const trimmed = role.trim();

  if (trimmed.length < MIN_ROLE_LENGTH) {
    return {
      valid: false,
      error: `Role must be at least ${MIN_ROLE_LENGTH} characters. Current length: ${trimmed.length}.`,
    };
  }

  if (trimmed.length > MAX_ROLE_LENGTH) {
    return {
      valid: false,
      error: `Role must be at most ${MAX_ROLE_LENGTH} characters. Current length: ${trimmed.length}.`,
    };
  }

  return { valid: true };
}
