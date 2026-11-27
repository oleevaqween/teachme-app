import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './http-response';

describe('apiErrorMessage', () => {
  it('uses a JSON API error when one is available', async () => {
    const response = Response.json({ error: 'Stage not found.' }, { status: 404 });

    await expect(apiErrorMessage(response, 'Failed to load messages')).resolves.toBe(
      'Stage not found.'
    );
  });

  it('does not try to parse an HTML error page as JSON', async () => {
    const response = new Response('<!DOCTYPE html><title>Not found</title>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

    await expect(apiErrorMessage(response, 'Failed to load messages')).resolves.toBe(
      'Failed to load messages (HTTP 404).'
    );
  });

  it('falls back safely when a JSON response is malformed', async () => {
    const response = new Response('{', {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(apiErrorMessage(response, 'Failed to initialize session')).resolves.toBe(
      'Failed to initialize session (HTTP 502).'
    );
  });
});
