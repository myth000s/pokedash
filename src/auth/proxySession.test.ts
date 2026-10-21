import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { updateSession } from './proxySession';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

const create = vi.mocked(createServerClient);
const getClaims = vi.fn();
const request = () => new NextRequest('http://localhost/', { headers: { cookie: 'sb-x-auth-token=v' } });

beforeEach(() => {
  getClaims.mockReset();
  create.mockReset().mockReturnValue({ auth: { getClaims } } as unknown as ReturnType<typeof createServerClient>);
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publishable');
});
afterEach(() => vi.unstubAllEnvs());

describe('updateSession', () => {
  it('reads the verified claims', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', aal: 'aal2', user_metadata: { must_change_password: 'yes' } } }, error: null });
    const { response, claims } = await updateSession(request());
    expect(claims).toEqual({ sub: 'u1', aal: 'aal2', user_metadata: { must_change_password: false } });
    expect(response.status).toBe(200);
  });

  it('fails closed without configuration', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    expect((await updateSession(request())).claims).toBeNull();
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '');
    expect((await updateSession(request())).claims).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('fails closed when getClaims reports an error', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', aal: 'aal2' } }, error: { name: 'AuthApiError', status: 401 } });
    expect((await updateSession(request())).claims).toBeNull();
    getClaims.mockResolvedValue({ data: null, error: null });
    expect((await updateSession(request())).claims).toBeNull();
  });

  it('fails closed when getClaims throws', async () => {
    getClaims.mockRejectedValue(new Error('JWKS fetch failed'));
    const { response, claims } = await updateSession(request());
    expect(claims).toBeNull();
    expect(response.status).toBe(200);
  });

  it('fails closed when the client cannot be created', async () => {
    create.mockImplementation(() => {
      throw new Error('Invalid supabaseUrl');
    });
    expect((await updateSession(request())).claims).toBeNull();
  });
});
