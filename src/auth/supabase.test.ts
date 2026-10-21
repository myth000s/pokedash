import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseServerClient } from './supabase';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ fake: true })) }));
const cookieStore = { getAll: vi.fn(() => [{ name: 'sb', value: 'v' }]), set: vi.fn() };
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

const create = vi.mocked(createServerClient);

beforeEach(() => {
  create.mockClear();
  cookieStore.set.mockReset();
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publishable');
});
afterEach(() => vi.unstubAllEnvs());

type Options = Parameters<typeof createServerClient>[2] & {
  cookies: { getAll: () => unknown; setAll: (c: { name: string; value: string; options: object }[], h: object) => void };
};
const lastOptions = () => create.mock.calls.at(-1)![2] as Options;

describe('createSupabaseServerClient', () => {
  it('returns null when the URL or key is unset', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    expect(await createSupabaseServerClient()).toBeNull();
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '');
    expect(await createSupabaseServerClient()).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it('creates a cookie-backed client with HTTP-only cookies', async () => {
    expect(await createSupabaseServerClient()).toEqual({ fake: true });
    expect(create).toHaveBeenCalledWith('http://127.0.0.1:54321', 'publishable', expect.anything());
    const options = lastOptions();
    expect(options.cookieOptions).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
    expect(options.cookies.getAll()).toEqual([{ name: 'sb', value: 'v' }]);
    options.cookies.setAll([{ name: 'sb', value: 'w', options: { path: '/' } }], {});
    expect(cookieStore.set).toHaveBeenCalledWith('sb', 'w', { path: '/' });
  });
  it('marks cookies secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await createSupabaseServerClient();
    expect(lastOptions().cookieOptions).toMatchObject({ secure: true, httpOnly: true });
  });
  it('ignores cookie writes from Server Components', async () => {
    cookieStore.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
    });
    await createSupabaseServerClient();
    expect(() => lastOptions().cookies.setAll([{ name: 'sb', value: 'w', options: {} }], {})).not.toThrow();
  });
});
