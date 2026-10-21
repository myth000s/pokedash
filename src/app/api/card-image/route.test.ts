import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getAuthState } from '@/auth/session';
import { fetchCardImage } from '@/lib/imageProxy';
import { GET } from './route';

vi.mock('@/auth/session', () => ({ getAuthState: vi.fn() }));
vi.mock('@/lib/imageProxy', () => ({ fetchCardImage: vi.fn() }));

const authState = vi.mocked(getAuthState);
const fetchImage = vi.mocked(fetchCardImage);
const fetchSpy = vi.fn();
const request = () => new NextRequest('http://localhost/api/card-image?src=https%3A%2F%2Fcardtrader.com%2Fx.jpg');

beforeEach(() => {
  authState.mockReset();
  fetchImage.mockReset().mockResolvedValue({ ok: true, body: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/card-image', () => {
  it.each([
    { status: 'anonymous' },
    { status: 'needs-mfa-enrolment', userId: 'u1' },
    { status: 'needs-mfa-verification', userId: 'u1' },
    { status: 'needs-password-change', userId: 'u1' },
  ] as const)('answers $status with an empty 401 and fetches nothing', async (state) => {
    authState.mockResolvedValue(state);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
    expect(fetchImage).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serves the picture to a fully signed-in user', async () => {
    authState.mockResolvedValue({ status: 'ok', userId: 'u1' });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(fetchImage).toHaveBeenCalledWith('https://cardtrader.com/x.jpg', fetchSpy);
  });
});
