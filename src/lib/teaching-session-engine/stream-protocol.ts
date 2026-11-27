const ERROR_PREFIX = '[Error:';

export function formatTeachingStreamError(message: string): string {
  return `${ERROR_PREFIX} ${message}]`;
}

/**
 * Teaching responses are streamed as plain text. If generation fails after
 * the HTTP response starts, the server appends an error marker to that stream.
 */
export function extractTeachingStreamError(content: string): string | null {
  const trimmed = content.trim();
  const marker = trimmed.lastIndexOf(ERROR_PREFIX);
  if (marker < 0 || !trimmed.endsWith(']')) return null;

  const message = trimmed.slice(marker + ERROR_PREFIX.length, -1).trim();
  return message || 'TeachMe could not complete the answer.';
}
