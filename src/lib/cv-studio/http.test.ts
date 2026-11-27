import { describe, expect, it } from 'vitest';
import { localRequest, readBody } from './http';
describe('Local API boundaries', () => {
  it('accepts the browser host when Next normalizes its internal URL', () => {
    expect(() => localRequest(new Request('http://localhost:3100/api/cv-studio', { headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100', 'sec-fetch-site': 'same-origin' } }))).not.toThrow();
  });
  it('rejects foreign hosts, origins and cross-site requests', () => {
    const cases: Record<string, string>[] = [{ host: 'evil.example' }, { origin: 'https://evil.example' }, { origin: 'http://localhost:3000' }, { 'sec-fetch-site': 'cross-site' }];
    for (const headers of cases) {
      expect(() => localRequest(new Request('http://localhost:3100/api/cv-studio', { headers }))).toThrow();
    }
  });
  it('bounds actual request bytes without trusting Content-Length', async () => {
    await expect(readBody(new Request('http://localhost:3100', { method: 'POST', body: 'x'.repeat(700001) }))).rejects.toThrow('too large');
    await expect(readBody(new Request('http://localhost:3100', { method: 'POST', body: '{"ok":true}' }))).resolves.toEqual({ ok: true });
  });
});
