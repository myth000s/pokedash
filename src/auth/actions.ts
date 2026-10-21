'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/auth/supabase';
import { passwordSchema } from '@/auth/password';
import { getAuthState, requireAuthState } from '@/auth/session';
import { statusPath } from '@/auth/state';

export type FormState = { error?: string };
export type Enrolment = { factorId: string; qrCode: string; secret: string };
export type EnrolmentResult = Enrolment | { error: string };

const WRONG_CREDENTIALS = 'Email or password is wrong.';
const RATE_LIMITED = 'Too many attempts. Wait a few minutes and try again.';
const UNAVAILABLE = 'Login is not available right now.';
const INVALID_EMAIL = 'Enter a valid email address.';
const WRONG_CODE = "That code didn't work. Check the time on your phone and try again.";
const CODE_FORMAT = 'Enter the 6-digit code from your authenticator app.';
const ALREADY_ENROLLED = 'An authenticator is already set up for this account. Sign out and log in again.';
const SETUP_EXPIRED = 'This setup has expired. Reload the page to start again.';
const NO_FACTOR = 'No authenticator is set up for this account. Sign out and log in again.';
const PASSWORD_LENGTH = 'Use 12 to 72 characters.';
const PASSWORDS_DIFFER = "The passwords don't match.";
const SAME_PASSWORD = 'Choose a password different from the starting one.';
const WEAK_PASSWORD = 'Choose a stronger password.';
const PASSWORD_UNAVAILABLE = "The password can't be changed right now. Try again in a few minutes.";

const emailSchema = z.email().max(254);
const CODE_PATTERN = /^\d{6}$/;

type ApiError = { status?: number; code?: string };

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** Status and code only: never the email, password, TOTP code, secret or Supabase's message. */
function logFailure(what: string, error: ApiError): void {
  console.error(`${what} failed:`, error.status ?? 'no status', error.code ?? 'no code');
}

/**
 * Maps a Supabase sign-in error to the login copy. Wrong password and unknown email look the same.
 * Wrong credentials come back as 400; anything else is logged (status and code only), so a wrong
 * or rotated publishable key (401/403) can be told apart from a mistyped password.
 */
function signInError(error: ApiError): string {
  if (error.status !== 400) logFailure('Sign-in', error);
  if (error.status === 429) return RATE_LIMITED;
  if (!error.status || error.status >= 500) return UNAVAILABLE;
  return WRONG_CREDENTIALS;
}

/** Factor lookups and enrolment: a rate limit is said as such, anything else counts as an outage. */
function mfaFailure(what: string, error: ApiError): string {
  if (error.status === 429) return RATE_LIMITED;
  logFailure(what, error);
  return UNAVAILABLE;
}

/** A rejected TOTP code. A wrong code and any other client error read the same. */
function codeError(error: ApiError): string {
  if (error.status === 429) return RATE_LIMITED;
  if (!error.status || error.status >= 500) {
    logFailure('MFA verification', error);
    return UNAVAILABLE;
  }
  return WRONG_CODE;
}

function passwordError(error: ApiError): string {
  if (error.code === 'same_password') return SAME_PASSWORD;
  if (error.code === 'weak_password') return WEAK_PASSWORD;
  if (error.status === 429) return RATE_LIMITED;
  logFailure('Password change', error);
  return PASSWORD_UNAVAILABLE;
}

/** Password login, the first factor. Success continues at /mfa for the TOTP code. */
export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, 'email').trim().toLowerCase();
  const password = field(form, 'password');
  if (!emailSchema.safeParse(email).success) return { error: INVALID_EMAIL };
  // The user script and the password change both enforce this rule, so no account has a password outside it.
  if (!passwordSchema.safeParse(password).success) return { error: WRONG_CREDENTIALS };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: UNAVAILABLE };

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: signInError(error) };
  } catch {
    return { error: signInError({}) };
  }
  // redirect() throws, so it stays outside the try block.
  redirect('/mfa');
}

/**
 * Starts TOTP enrolment for a user without a factor. Only the "Set up authenticator" button calls
 * this, never a page render. The factor list comes from the server (listFactors fetches the user),
 * not from the session cookie, so a second factor is never enrolled.
 */
export async function startEnrolment(): Promise<EnrolmentResult> {
  await requireAuthState(['needs-mfa-enrolment']);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: UNAVAILABLE };

  try {
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error) return { error: mfaFailure('Factor list', listed.error) };
    if (listed.data.all.some((f) => f.status === 'verified')) return { error: ALREADY_ENROLLED };
    // An enrolment left unverified (a closed tab, a reload) is replaced rather than piling up.
    for (const factor of listed.data.all) {
      if (factor.factor_type !== 'totp' || factor.status !== 'unverified') continue;
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) return { error: mfaFailure('Factor removal', error) };
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'pokedash' });
    if (error) return { error: mfaFailure('Enrolment', error) };
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  } catch {
    return { error: mfaFailure('Enrolment', {}) };
  }
}

/**
 * The second factor. Verifies the code against the user's verified TOTP factor, or, during
 * enrolment, against the posted factor if the server lists it as this user's. Then refreshes
 * the session and goes to wherever the new AAL2 session belongs.
 */
export async function verifyMfa(_prev: FormState, form: FormData): Promise<FormState> {
  // Authenticator apps show the code as "123 456", so spaces are dropped before the check.
  const code = field(form, 'code').replace(/\s/g, '');
  if (!CODE_PATTERN.test(code)) return { error: CODE_FORMAT };
  const postedFactorId = field(form, 'factorId');

  await requireAuthState(['needs-mfa-enrolment', 'needs-mfa-verification']);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: UNAVAILABLE };

  try {
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error) return { error: mfaFailure('Factor list', listed.error) };
    const totp = listed.data.all.filter((f) => f.factor_type === 'totp');
    // A verified factor always wins; a posted id only picks this user's own enrolment in progress.
    const factor = totp.find((f) => f.status === 'verified') ?? (postedFactorId ? totp.find((f) => f.id === postedFactorId) : undefined);
    if (!factor) return { error: postedFactorId ? SETUP_EXPIRED : NO_FACTOR };

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return { error: codeError(error) };
    const refreshed = await supabase.auth.refreshSession();
    // The verified session is already AAL2, so a failed refresh is logged and not shown.
    if (refreshed.error) logFailure('Session refresh', refreshed.error);
  } catch {
    return { error: codeError({}) };
  }
  const state = await getAuthState();
  redirect(statusPath(state.status));
}

/**
 * Sets the user's own password and clears the must-change flag. AAL2 only (ruling R2): MFA comes
 * first, and Supabase may refuse a password update at AAL1 once a factor is enrolled.
 */
export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = field(form, 'password');
  if (!passwordSchema.safeParse(password).success) return { error: PASSWORD_LENGTH };
  if (field(form, 'confirm') !== password) return { error: PASSWORDS_DIFFER };

  await requireAuthState(['needs-password-change', 'ok']);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: PASSWORD_UNAVAILABLE };

  try {
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    if (error) return { error: passwordError(error) };
    // The JWT keeps the old flag until it is reissued, and the proxy routes by the JWT.
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) logFailure('Session refresh', refreshed.error);
  } catch {
    return { error: passwordError({}) };
  }
  redirect('/');
}

/** Ends this browser's session only (other devices stay signed in) and always lands on the login page. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // A failed revoke still leaves the user on the login page; the proxy re-checks every request.
    }
  }
  redirect('/login');
}
