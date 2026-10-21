import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/auth/supabase';
import { changePassword, signIn, signOut, startEnrolment, verifyMfa } from './actions';

vi.mock('@/auth/supabase', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));

const createClient = vi.mocked(createSupabaseServerClient);
const signInWithPassword = vi.fn();
const signOutMock = vi.fn();
const getClaims = vi.fn();
const getAuthenticatorAssuranceLevel = vi.fn();
const listFactors = vi.fn();
const enroll = vi.fn();
const unenroll = vi.fn();
const challengeAndVerify = vi.fn();
const updateUser = vi.fn();
const refreshSession = vi.fn();

const form = (email: string, password: string) => {
  const f = new FormData();
  f.set('email', email);
  f.set('password', password);
  return f;
};
const authError = (status: number | undefined, code?: string) => ({
  data: { user: null, session: null },
  error: { name: 'AuthApiError', message: 'failed', status, code },
});
const apiError = (status: number | undefined, code?: string) => ({
  data: null,
  error: { name: 'AuthApiError', message: 'failed', status, code },
});
const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [name, value] of Object.entries(fields)) f.set(name, value);
  return f;
};

type Status = 'anonymous' | 'needs-mfa-enrolment' | 'needs-mfa-verification' | 'needs-password-change' | 'ok';
const claimsFor = (status: Status) => {
  if (status === 'anonymous') return { data: null, error: null };
  const aal = status === 'needs-password-change' || status === 'ok' ? 'aal2' : 'aal1';
  return {
    data: { claims: { sub: 'u1', aal, user_metadata: { must_change_password: status === 'needs-password-change' } } },
    error: null,
  };
};
/** The session getAuthState sees: the first read gets `status`, later reads get `after` (once the action ran). */
function sessionIs(status: Status, after: Status = status) {
  getClaims.mockReset().mockResolvedValueOnce(claimsFor(status)).mockResolvedValue(claimsFor(after));
  getAuthenticatorAssuranceLevel.mockReset().mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: status === 'needs-mfa-verification' ? 'aal2' : 'aal1' },
    error: null,
  });
}
const totpFactor = (id: string, status: 'verified' | 'unverified') => ({
  id, factor_type: 'totp', status, created_at: '', updated_at: '',
});
/** listFactors as auth-js returns it: `all` holds every factor, `totp` only the verified ones. */
function factorsAre(...factors: ReturnType<typeof totpFactor>[]) {
  listFactors.mockResolvedValue({
    data: { all: factors, totp: factors.filter((f) => f.status === 'verified'), phone: [], webauthn: [] },
    error: null,
  });
}

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ data: { user: { id: 'u1' }, session: {} }, error: null });
  signOutMock.mockReset().mockResolvedValue({ error: null });
  listFactors.mockReset();
  factorsAre();
  enroll.mockReset().mockResolvedValue({
    data: { id: 'new', type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETBASE32', uri: 'otpauth://x' } },
    error: null,
  });
  unenroll.mockReset().mockResolvedValue({ data: { id: 'old' }, error: null });
  challengeAndVerify.mockReset().mockResolvedValue({ data: {}, error: null });
  updateUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  refreshSession.mockReset().mockResolvedValue({ data: { session: {}, user: { id: 'u1' } }, error: null });
  sessionIs('anonymous');
  createClient.mockReset().mockResolvedValue({
    auth: {
      signInWithPassword,
      signOut: signOutMock,
      getClaims,
      updateUser,
      refreshSession,
      mfa: { getAuthenticatorAssuranceLevel, listFactors, enroll, unenroll, challengeAndVerify },
    },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
});
afterEach(() => vi.restoreAllMocks());

describe('signIn', () => {
  it('normalizes the email before signing in', async () => {
    await expect(signIn({}, form(' Friend@Example.COM ', 'x'.repeat(12)))).rejects.toThrow('REDIRECT /mfa');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'friend@example.com', password: 'x'.repeat(12) });
  });
  it('gives one message for wrong password and unknown email', async () => {
    signInWithPassword.mockResolvedValue(authError(400, 'invalid_credentials'));
    expect(await signIn({}, form('a@b.de', 'wrong-password'))).toEqual({ error: 'Email or password is wrong.' });
    expect(await signIn({}, form('nobody@b.de', 'wrong-password'))).toEqual({ error: 'Email or password is wrong.' });
  });
  it('reports rate limits', async () => {
    signInWithPassword.mockResolvedValue(authError(429, 'over_request_rate_limit'));
    expect((await signIn({}, form('a@b.de', 'x'.repeat(12)))).error).toBe('Too many attempts. Wait a few minutes and try again.');
  });
  it('fails closed without configuration', async () => {
    createClient.mockResolvedValue(null);
    expect((await signIn({}, form('a@b.de', 'x'.repeat(12)))).error).toBe('Login is not available right now.');
  });
  it('rejects a malformed email without calling Supabase', async () => {
    expect(await signIn({}, form('not-an-email', 'x'.repeat(12)))).toEqual({ error: 'Enter a valid email address.' });
    expect(await signIn({}, new FormData())).toEqual({ error: 'Enter a valid email address.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it('treats a password no account can have as wrong credentials without calling Supabase', async () => {
    for (const password of ['', 'x'.repeat(11), 'x'.repeat(73)]) {
      expect(await signIn({}, form('a@b.de', password))).toEqual({ error: 'Email or password is wrong.' });
    }
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it('reports an outage as unavailable and logs no credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    signInWithPassword.mockResolvedValueOnce(authError(500, 'unexpected_failure'));
    expect((await signIn({}, form('a@b.de', 'secret-password-1'))).error).toBe('Login is not available right now.');
    signInWithPassword.mockResolvedValueOnce(authError(0));
    expect((await signIn({}, form('a@b.de', 'secret-password-1'))).error).toBe('Login is not available right now.');
    signInWithPassword.mockRejectedValueOnce(new Error('socket hang up'));
    expect((await signIn({}, form('a@b.de', 'secret-password-1'))).error).toBe('Login is not available right now.');
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('a@b.de');
    expect(logged).not.toContain('secret-password-1');
  });
  it('logs a rejected request (a wrong publishable key) by status and code, with the usual copy', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A wrong or rotated key: the gateway answers 401 without an error code.
    signInWithPassword.mockResolvedValueOnce(authError(401));
    expect(await signIn({}, form('a@b.de', 'secret-password-1'))).toEqual({ error: 'Email or password is wrong.' });
    expect(log).toHaveBeenLastCalledWith('Sign-in failed:', 401, 'no code');
    signInWithPassword.mockResolvedValueOnce(authError(403, 'bad_jwt'));
    expect(await signIn({}, form('a@b.de', 'secret-password-1'))).toEqual({ error: 'Email or password is wrong.' });
    expect(log).toHaveBeenLastCalledWith('Sign-in failed:', 403, 'bad_jwt');
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('a@b.de');
    expect(logged).not.toContain('secret-password-1');
    expect(log.mock.calls.flat()).not.toContain('failed'); // Supabase's message is never logged
  });
  it('does not log a plain wrong password', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    signInWithPassword.mockResolvedValueOnce(authError(400, 'invalid_credentials'));
    expect(await signIn({}, form('a@b.de', 'secret-password-1'))).toEqual({ error: 'Email or password is wrong.' });
    expect(log).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('signs out locally and goes to login', async () => {
    await expect(signOut()).rejects.toThrow('REDIRECT /login');
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('redirects a stale sign-out without a session to login', async () => {
    createClient.mockResolvedValue(null);
    await expect(signOut()).rejects.toThrow('REDIRECT /login');
  });
  it('still goes to login when Supabase reports an error', async () => {
    signOutMock.mockResolvedValueOnce({ error: { name: 'AuthSessionMissingError', status: 400 } });
    await expect(signOut()).rejects.toThrow('REDIRECT /login');
    signOutMock.mockRejectedValueOnce(new Error('network down'));
    await expect(signOut()).rejects.toThrow('REDIRECT /login');
  });
});

describe('startEnrolment', () => {
  beforeEach(() => sessionIs('needs-mfa-enrolment'));

  it('removes leftover unverified factors before enrolling', async () => {
    factorsAre(totpFactor('old', 'unverified'));
    expect(await startEnrolment()).toEqual({ factorId: 'new', qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETBASE32' });
    expect(unenroll).toHaveBeenCalledWith({ factorId: 'old' });
    expect(enroll).toHaveBeenCalledWith({ factorType: 'totp', issuer: 'pokedash' });
    expect(unenroll.mock.invocationCallOrder[0]).toBeLessThan(enroll.mock.invocationCallOrder[0]);
  });
  it('refuses enrolment for users who already have a factor', async () => {
    sessionIs('needs-mfa-verification');
    await expect(startEnrolment()).rejects.toThrow('REDIRECT /mfa');
    expect(enroll).not.toHaveBeenCalled();
  });
  it('refuses a second factor when the server lists a verified one, whatever the session says', async () => {
    factorsAre(totpFactor('mine', 'verified'), totpFactor('old', 'unverified'));
    expect(await startEnrolment()).toEqual({ error: 'An authenticator is already set up for this account. Sign out and log in again.' });
    expect(unenroll).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
  });
  it('sends people without a session to the login page', async () => {
    sessionIs('anonymous');
    await expect(startEnrolment()).rejects.toThrow('REDIRECT /login');
    expect(enroll).not.toHaveBeenCalled();
  });
  it('never logs the enrolment secret, on success or on failure', async () => {
    const spies = (['error', 'warn', 'log', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    // util.format prints an Error's message and stack, which JSON.stringify would drop.
    const output = () => spies.flatMap((s) => s.mock.calls.map((args) => format(...args))).join('\n');

    // A successful enrolment first, so the secret exists in this run.
    expect(await startEnrolment()).toMatchObject({ secret: 'SECRETBASE32' });

    // Then every failure path, including errors that carry the secret.
    enroll.mockResolvedValueOnce({ ...apiError(500, 'unexpected_failure'), data: { id: 'new', totp: { secret: 'SECRETBASE32' } } });
    expect(await startEnrolment()).toEqual({ error: 'Login is not available right now.' });
    listFactors.mockResolvedValueOnce(apiError(401, 'bad_jwt'));
    expect(await startEnrolment()).toEqual({ error: 'Login is not available right now.' });
    factorsAre(totpFactor('old', 'unverified'));
    unenroll.mockResolvedValueOnce(apiError(500));
    const enrolCalls = enroll.mock.calls.length;
    expect(await startEnrolment()).toEqual({ error: 'Login is not available right now.' });
    expect(enroll).toHaveBeenCalledTimes(enrolCalls);
    enroll.mockRejectedValueOnce(new Error('socket hang up after secret SECRETBASE32'));
    expect(await startEnrolment()).toEqual({ error: 'Login is not available right now.' });

    expect(output()).toContain('Enrolment failed: 500 unexpected_failure');
    expect(output()).not.toContain('SECRETBASE32');
  });
});

describe('verifyMfa', () => {
  beforeEach(() => {
    sessionIs('needs-mfa-verification', 'ok');
    factorsAre(totpFactor('mine', 'verified'));
  });

  it('rejects malformed codes without calling Supabase', async () => {
    expect(await verifyMfa({}, fd({ code: '12a456' }))).toEqual({ error: 'Enter the 6-digit code from your authenticator app.' });
    for (const code of ['', '12345', '1234567', '١٢٣٤٥٦']) {
      expect(await verifyMfa({}, fd({ code }))).toEqual({ error: 'Enter the 6-digit code from your authenticator app.' });
    }
    expect(await verifyMfa({}, new FormData())).toEqual({ error: 'Enter the 6-digit code from your authenticator app.' });
    expect(challengeAndVerify).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
  it('accepts a code typed with spaces', async () => {
    await expect(verifyMfa({}, fd({ code: ' 123 456 ' }))).rejects.toThrow('REDIRECT /');
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'mine', code: '123456' });
  });
  it('verifies against the verified factor, refreshes the session and goes home', async () => {
    await expect(verifyMfa({}, fd({ code: '123456' }))).rejects.toThrow('REDIRECT /');
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'mine', code: '123456' });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(refreshSession.mock.invocationCallOrder[0]).toBeGreaterThan(challengeAndVerify.mock.invocationCallOrder[0]);
  });
  it('goes to the password page after MFA when a change is required', async () => {
    sessionIs('needs-mfa-verification', 'needs-password-change');
    await expect(verifyMfa({}, fd({ code: '123456' }))).rejects.toThrow('REDIRECT /account/password');
  });
  it('verifies the new factor from enrolment', async () => {
    sessionIs('needs-mfa-enrolment', 'needs-password-change');
    factorsAre(totpFactor('new', 'unverified'));
    await expect(verifyMfa({}, fd({ code: '123456', factorId: 'new' }))).rejects.toThrow('REDIRECT /account/password');
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'new', code: '123456' });
  });
  it('always uses the verified factor once there is one', async () => {
    factorsAre(totpFactor('mine', 'verified'), totpFactor('other', 'unverified'));
    await expect(verifyMfa({}, fd({ code: '123456', factorId: 'other' }))).rejects.toThrow('REDIRECT /');
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'mine', code: '123456' });
  });
  it('refuses a factor the server does not list for this user', async () => {
    sessionIs('needs-mfa-enrolment');
    factorsAre(totpFactor('new', 'unverified'));
    expect(await verifyMfa({}, fd({ code: '123456', factorId: 'someone-elses' }))).toEqual({
      error: 'This setup has expired. Reload the page to start again.',
    });
    sessionIs('needs-mfa-verification');
    factorsAre();
    expect(await verifyMfa({}, fd({ code: '123456' }))).toEqual({
      error: 'No authenticator is set up for this account. Sign out and log in again.',
    });
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });
  it('says when the code is wrong', async () => {
    challengeAndVerify.mockResolvedValue(apiError(422, 'mfa_verification_failed'));
    expect(await verifyMfa({}, fd({ code: '123456' }))).toEqual({ error: "That code didn't work. Check the time on your phone and try again." });
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it('reports rate limits and outages without logging the code', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionIs('needs-mfa-verification');
    challengeAndVerify.mockResolvedValueOnce(apiError(429, 'over_request_rate_limit'));
    expect(await verifyMfa({}, fd({ code: '987654' }))).toEqual({ error: 'Too many attempts. Wait a few minutes and try again.' });
    challengeAndVerify.mockResolvedValueOnce(apiError(500, 'unexpected_failure'));
    expect(await verifyMfa({}, fd({ code: '987654' }))).toEqual({ error: 'Login is not available right now.' });
    challengeAndVerify.mockRejectedValueOnce(new Error('socket hang up'));
    expect(await verifyMfa({}, fd({ code: '987654' }))).toEqual({ error: 'Login is not available right now.' });
    listFactors.mockResolvedValueOnce(apiError(500));
    expect(await verifyMfa({}, fd({ code: '987654' }))).toEqual({ error: 'Login is not available right now.' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('987654');
  });
  it('sends sessions that are already at AAL2 on without verifying again', async () => {
    sessionIs('ok');
    await expect(verifyMfa({}, fd({ code: '123456' }))).rejects.toThrow('REDIRECT /');
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });
});

describe('changePassword', () => {
  beforeEach(() => sessionIs('needs-password-change', 'ok'));
  const twice = (password: string) => fd({ password, confirm: password });

  it('validates the new password', async () => {
    expect(await changePassword({}, fd({ password: 'short', confirm: 'short' }))).toEqual({ error: 'Use 12 to 72 characters.' });
    expect(await changePassword({}, twice('x'.repeat(73)))).toEqual({ error: 'Use 12 to 72 characters.' });
    expect(await changePassword({}, fd({ password: 'a'.repeat(12), confirm: 'b'.repeat(12) }))).toEqual({ error: "The passwords don't match." });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it('clears the change flag and goes home', async () => {
    await expect(changePassword({}, fd({ password: 'a'.repeat(12), confirm: 'a'.repeat(12) }))).rejects.toThrow('REDIRECT /');
    expect(updateUser).toHaveBeenCalledWith({ password: 'a'.repeat(12), data: { must_change_password: false } });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(refreshSession.mock.invocationCallOrder[0]).toBeGreaterThan(updateUser.mock.invocationCallOrder[0]);
  });
  it('lets a fully signed-in user change their password too', async () => {
    sessionIs('ok');
    await expect(changePassword({}, twice('a'.repeat(12)))).rejects.toThrow('REDIRECT /');
    expect(updateUser).toHaveBeenCalledOnce();
  });
  it('requires MFA first', async () => {
    sessionIs('needs-mfa-verification');
    await expect(changePassword({}, twice('a'.repeat(12)))).rejects.toThrow('REDIRECT /mfa');
    sessionIs('anonymous');
    await expect(changePassword({}, twice('a'.repeat(12)))).rejects.toThrow('REDIRECT /login');
    expect(updateUser).not.toHaveBeenCalled();
  });
  it('asks for a password different from the starting one', async () => {
    updateUser.mockResolvedValue(apiError(422, 'same_password'));
    expect(await changePassword({}, twice('a'.repeat(12)))).toEqual({ error: 'Choose a password different from the starting one.' });
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it('reports other failures without logging the password', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const password = 'my-new-secret-pw';
    updateUser.mockResolvedValueOnce(apiError(422, 'weak_password'));
    expect(await changePassword({}, twice(password))).toEqual({ error: 'Choose a stronger password.' });
    updateUser.mockResolvedValueOnce(apiError(429, 'over_request_rate_limit'));
    expect(await changePassword({}, twice(password))).toEqual({ error: 'Too many attempts. Wait a few minutes and try again.' });
    updateUser.mockResolvedValueOnce(apiError(500, 'unexpected_failure'));
    expect(await changePassword({}, twice(password))).toEqual({ error: "The password can't be changed right now. Try again in a few minutes." });
    updateUser.mockRejectedValueOnce(new Error('socket hang up'));
    expect(await changePassword({}, twice(password))).toEqual({ error: "The password can't be changed right now. Try again in a few minutes." });
    expect(JSON.stringify(log.mock.calls)).not.toContain(password);
  });
});
