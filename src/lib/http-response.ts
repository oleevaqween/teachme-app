type ApiErrorBody = {
  error?: unknown;
};

/**
 * Read an API failure without assuming every server response is JSON.
 * Next.js can return an HTML error page for an unavailable route, and trying
 * to parse that page as JSON hides the useful HTTP status behind a syntax error.
 */
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (typeof body.error === 'string' && body.error.trim()) {
        return body.error.trim();
      }
    } catch {
      // Fall through to a status-based message when malformed JSON is returned.
    }
  }

  return response.status > 0
    ? `${fallback} (HTTP ${response.status}).`
    : `${fallback}.`;
}
