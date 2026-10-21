import { describe, it, expect, vi } from 'vitest';
import { fetchCardImage, MAX_IMAGE_BYTES } from './imageProxy';

const URL_OK = 'https://cardtrader.com/uploads/x.jpg';
const jpeg = (init: ResponseInit = {}) =>
  new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' }, ...init });
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

describe('fetchCardImage', () => {
  it.each([
    'https://cardtrader.com.evil.example/x.jpg', 'http://cardtrader.com/x.jpg',
    'https://user:pw@cardtrader.com/x.jpg', 'https://cardtrader.com:8443/x.jpg', 'not a url', '',
  ])('refuses %s without fetching', async (src) => {
    const f = vi.fn();
    expect(await fetchCardImage(src, f)).toEqual({ ok: false, status: 400 });
    expect(f).not.toHaveBeenCalled();
  });
  it('fetches with manual redirects and no credentials', async () => {
    const f = vi.fn().mockResolvedValue(jpeg());
    await fetchCardImage(URL_OK, f);
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: 'manual', credentials: 'omit' });
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('follows a redirect to www.cardtrader.com', async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect('https://www.cardtrader.com/x.jpg', 301)).mockResolvedValueOnce(jpeg());
    const r = await fetchCardImage(URL_OK, f);
    expect(r).toMatchObject({ ok: true, contentType: 'image/jpeg' });
    expect(r.ok && r.body.length).toBe(3);
  });
  it('refuses a redirect to another host', async () => {
    const f = vi.fn().mockResolvedValue(redirect('https://evil.example/x.jpg'));
    expect(await fetchCardImage(URL_OK, f)).toEqual({ ok: false, status: 502 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('stops after 3 redirects', async () => {
    const f = vi.fn().mockImplementation(async () => redirect('https://www.cardtrader.com/x.jpg'));
    expect(await fetchCardImage(URL_OK, f)).toEqual({ ok: false, status: 502 });
    expect(f).toHaveBeenCalledTimes(4);
  });
  it('refuses SVG', async () => {
    const f = vi.fn().mockResolvedValue(jpeg({ headers: { 'content-type': 'image/svg+xml' } }));
    expect(await fetchCardImage(URL_OK, f)).toEqual({ ok: false, status: 502 });
  });
  it('accepts a content type with parameters in any case', async () => {
    const f = vi.fn().mockResolvedValue(jpeg({ headers: { 'content-type': 'Image/PNG; charset=x' } }));
    expect(await fetchCardImage(URL_OK, f)).toMatchObject({ ok: true, contentType: 'image/png' });
  });
  it('refuses non-200 responses', async () => {
    const f = vi.fn().mockResolvedValue(jpeg({ status: 404 }));
    expect(await fetchCardImage(URL_OK, f)).toEqual({ ok: false, status: 502 });
  });
  it('returns 502 when the fetch throws', async () => {
    const f = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await fetchCardImage(URL_OK, f)).toEqual({ ok: false, status: 502 });
  });
  it('refuses bodies over 2 MB even without Content-Length', async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const stream = new ReadableStream({ start(c) { c.enqueue(big.slice(0, 1024 * 1024)); c.enqueue(big.slice(1024 * 1024)); c.close(); } });
    const f = vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    expect(await fetchCardImage(URL_OK, f)).toEqual({ ok: false, status: 502 });
  });
  it('refuses a declared Content-Length over 2 MB', async () => {
    const f = vi.fn().mockResolvedValue(jpeg({ headers: { 'content-type': 'image/jpeg', 'content-length': '3000000' } }));
    expect(await fetchCardImage(URL_OK, f)).toEqual({ ok: false, status: 502 });
  });
});
