import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, fetchJsonWithHeaders, fetchText, HttpError } from './http';

const res = (status: number, body: unknown = { ok: true }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const schema = z.object({ ok: z.boolean() });
const setup = (...responses: Response[]) => {
  const fetchImpl = vi.fn<typeof fetch>();
  responses.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const sleep = vi.fn(async (ms: number) => { void ms; });
  return { fetchImpl, sleep };
};

describe('fetchJson', () => {
  it('retries a rejected fetch and then succeeds', async () => {
    const d = setup(res(200));
    d.fetchImpl.mockReset();
    d.fetchImpl.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(res(200));
    await expect(fetchJson('https://x.test/a', { schema, ...d })).resolves.toEqual({ ok: true });
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('passes a timeout signal on every attempt', async () => {
    const d = setup(res(200));
    await fetchJson('https://x.test/a', { schema, ...d });
    expect(d.fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('wraps the final network error with the URL but never the Authorization value', async () => {
    const cause = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(cause);
    const sleep = vi.fn(async (ms: number) => { void ms; });
    const err = await fetchJson('https://x.test/a', {
      schema, fetchImpl, sleep, retries: 1, headers: { Authorization: 'Bearer SECRET123' },
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Network error for https://x.test/a: ECONNRESET');
    expect((err as Error).message).not.toContain('SECRET123');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('returns the parsed body', async () => {
    const d = setup(res(200));
    await expect(fetchJson('https://x.test/a', { schema, ...d })).resolves.toEqual({ ok: true });
  });
  it('retries a 503 and then succeeds', async () => {
    const d = setup(res(503), res(200));
    await fetchJson('https://x.test/a', { schema, ...d });
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
    expect(d.sleep.mock.calls).toEqual([[500]]);
  });
  it('waits for Retry-After on 429', async () => {
    const d = setup(res(429, {}, { 'Retry-After': '2' }), res(200));
    await fetchJson('https://x.test/a', { schema, ...d });
    expect(d.sleep.mock.calls).toEqual([[2000]]);
  });
  it('does not retry a 404', async () => {
    const d = setup(res(404));
    await expect(fetchJson('https://x.test/a', { schema, ...d })).rejects.toMatchObject({ status: 404 });
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('gives up after the last retry', async () => {
    const d = setup(res(500), res(500), res(500));
    await expect(fetchJson('https://x.test/a', { schema, retries: 2, ...d })).rejects.toBeInstanceOf(HttpError);
    expect(d.fetchImpl).toHaveBeenCalledTimes(3);
    expect(d.sleep.mock.calls).toEqual([[500], [1000]]);
  });
  it('rejects a body that does not match the schema', async () => {
    const d = setup(res(200, { nope: 1 }));
    await expect(fetchJson('https://x.test/a', { schema, ...d })).rejects.toThrow();
  });
  it('never puts the token in the error message', async () => {
    const d = setup(res(401));
    const err = await fetchJson('https://x.test/a', { schema, headers: { Authorization: 'Bearer secret-token' }, ...d }).catch((e) => e);
    expect(String(err.message)).not.toContain('secret-token');
  });
  it('returns headers with the parsed body', async () => {
    const d = setup(res(200, { ok: true }, { 'X-RateLimit-Daily-Remaining': '42' }));
    const r = await fetchJsonWithHeaders('https://x.test/a', { schema, ...d });
    expect(r.data).toEqual({ ok: true });
    expect(r.headers.get('X-RateLimit-Daily-Remaining')).toBe('42');
  });
  it('fetches text with the same retries', async () => {
    const d = setup(new Response('x', { status: 503 }), new Response('<xml/>', { status: 200 }));
    await expect(fetchText('https://x.test/a', d)).resolves.toBe('<xml/>');
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
  });
});
