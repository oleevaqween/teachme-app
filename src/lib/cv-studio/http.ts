import { ZodError } from 'zod';
import { ConflictError } from './repository';
export function localRequest(request: Request) {
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('This personal workspace is available only on localhost.');
  // Next may normalize request.url to localhost even when the browser uses 127.0.0.1.
  // Match the browser Origin against the validated Host, never forwarded headers.
  const host = request.headers.get('host') || url.host;
  const browserUrl = new URL(url.protocol + '//' + host);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(browserUrl.hostname) || browserUrl.host !== host) throw new Error('Invalid local host.');
  const origin = request.headers.get('origin');
  if (origin && origin !== browserUrl.origin) throw new Error('Cross-origin requests are not allowed.');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new Error('Cross-site requests are not allowed.');
}
export async function readBytes(request: Request, limit = 700000) {
  // Bound the actual stream, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is required.');
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); throw new Error('The request is too large.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function readBody(request: Request) {
  return JSON.parse((await readBytes(request)).toString('utf8'));
}
export function apiError(error: unknown) {
  const message = error instanceof ZodError ? 'Please check the CV fields and try again.' : error instanceof Error ? error.message : 'The operation could not be completed.';
  return Response.json({ error: message }, { status: error instanceof ConflictError ? 409 : 400 });
}
