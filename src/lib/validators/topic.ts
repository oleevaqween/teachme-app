// src/lib/validators/topic.ts

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const MIN_TOPIC_LENGTH = 3;
const MAX_TOPIC_LENGTH = 200;

/**
 * Validates topic input: 3-200 characters after trimming, non-empty.
 */
export function validateTopic(topic: string): ValidationResult {
  const trimmed = topic.trim();

  if (trimmed.length < MIN_TOPIC_LENGTH) {
    return {
      valid: false,
      error: `Topic must be at least ${MIN_TOPIC_LENGTH} characters. Current length: ${trimmed.length}.`,
    };
  }

  if (trimmed.length > MAX_TOPIC_LENGTH) {
    return {
      valid: false,
      error: `Topic must be at most ${MAX_TOPIC_LENGTH} characters. Current length: ${trimmed.length}.`,
    };
  }

  return { valid: true };
}
