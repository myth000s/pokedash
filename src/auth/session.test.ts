import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/auth/supabase';
import { getAuthState, requireAal2, requireAuthState } from './session';

vi.mock('@/auth/supabase', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));

const createClient = vi.mocked(createSupabaseServerClient);

function fakeClient(
  claims: { data: { claims: Record<string, unknown> } | null; error: Error | null },
  aal: { data: { currentLevel: string | null; nextLevel: string | null } | null; error: Error | null } = {
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
    error: null,
  },
) {
  const getAuthenticatorAssuranceLevel = vi.fn(async () => aal);
  const client = { auth: { getClaims: vi.fn(async () => claims), mfa: { getAuthenticatorAssuranceLevel } } };
  createClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  return { getAuthenticatorAssuranceLevel };
}

beforeEach(() => createClient.mockReset());

describe('getAuthState', () => {
  it('is anonymous when Supabase is not configured', async () => {
    createClient.mockResolvedValue(null);
    expect(await getAuthState()).toEqual({ status: 'anonymous' });
  });
  it('is anonymous when getClaims fails', async () => {
    fakeClient({ data: null, error: new Error('bad jwt') });
    expect(await getAuthState()).toEqual({ status: 'anonymous' });
  });
  it('is anonymous without a session', async () => {
    fakeClient({ data: null, error: null });
    expect(await getAuthState()).toEqual({ status: 'anonymous' });
  });
  it('asks Supabase for the next level only at AAL1', async () => {
    const aal1 = fakeClient({ data: { claims: { sub: 'u1', aal: 'aal1' } }, error: null }, { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    expect(await getAuthState()).toEqual({ status: 'needs-mfa-verification', userId: 'u1' });
    expect(aal1.getAuthenticatorAssuranceLevel).toHaveBeenCalledOnce();

    const aal2 = fakeClient({ data: { claims: { sub: 'u1', aal: 'aal2' } }, error: null });
    expect(await getAuthState()).toEqual({ status: 'ok', userId: 'u1' });
    expect(aal2.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
  it('stays short of ok when the level lookup fails', async () => {
    fakeClient({ data: { claims: { sub: 'u1', aal: 'aal1' } }, error: null }, { data: null, error: new Error('no session') });
    expect(await getAuthState()).toEqual({ status: 'needs-mfa-enrolment', userId: 'u1' });
  });
  it('reads the password-change flag from user metadata', async () => {
    fakeClient({ data: { claims: { sub: 'u1', aal: 'aal2', user_metadata: { must_change_password: true } } }, error: null });
    expect(await getAuthState()).toEqual({ status: 'needs-password-change', userId: 'u1' });
  });
});

describe('requireAuthState', () => {
  it('redirects a disallowed status to its page', async () => {
    fakeClient({ data: { claims: { sub: 'u1', aal: 'aal1' } }, error: null }, { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    await expect(requireAal2()).rejects.toThrow('REDIRECT /mfa');
  });
  it('redirects anonymous visitors to the login page', async () => {
    createClient.mockResolvedValue(null);
    await expect(requireAal2()).rejects.toThrow('REDIRECT /login');
  });
  it('redirects a flagged user to the password page', async () => {
    fakeClient({ data: { claims: { sub: 'u1', aal: 'aal2', user_metadata: { must_change_password: true } } }, error: null });
    await expect(requireAal2()).rejects.toThrow('REDIRECT /account/password');
  });
  it('returns an allowed state', async () => {
    fakeClient({ data: { claims: { sub: 'u1', aal: 'aal2' } }, error: null });
    expect(await requireAal2()).toEqual({ status: 'ok', userId: 'u1' });
    fakeClient({ data: { claims: { sub: 'u1', aal: 'aal1' } }, error: null });
    expect(await requireAuthState(['needs-mfa-enrolment', 'needs-mfa-verification'])).toEqual({ status: 'needs-mfa-enrolment', userId: 'u1' });
  });
});
