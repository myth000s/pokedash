import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, HttpError } from './http';

const res = (status: number, body: unknown = { ok: true }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const schema = z.object({ ok: z.boolean() });
const setup = (...responses: Response[]) => {
  const fetchImpl = vi.fn<typeof fetch>();
  responses.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const sleep = vi.fn(async (_ms: number) => {});
  return { fetchImpl, sleep };
};

describe('fetchJson', () => {
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
});
