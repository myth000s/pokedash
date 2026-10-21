// Pure auth state: no I/O, so the gate logic is unit-tested without Supabase.

export interface SessionClaims { sub: string; aal?: string; user_metadata?: { must_change_password?: boolean } }
export type AuthStatus = 'anonymous' | 'needs-mfa-enrolment' | 'needs-mfa-verification' | 'needs-password-change' | 'ok';
export type AuthState = { status: 'anonymous' } | { status: Exclude<AuthStatus, 'anonymous'>; userId: string };

/**
 * Maps verified JWT claims to where the user stands. Only an `aal2` claim can reach `ok`;
 * `nextLevel` only picks between enrolling a first factor and verifying an existing one.
 */
export function resolveAuthState(claims: SessionClaims | null, nextLevel: 'aal1' | 'aal2' | null): AuthState {
  if (!claims || !claims.sub) return { status: 'anonymous' };
  const userId = claims.sub;
  if (claims.aal !== 'aal2') {
    return { status: nextLevel === 'aal2' ? 'needs-mfa-verification' : 'needs-mfa-enrolment', userId };
  }
  if (claims.user_metadata?.must_change_password === true) return { status: 'needs-password-change', userId };
  return { status: 'ok', userId };
}

const STATUS_PATHS: Record<AuthStatus, string> = {
  anonymous: '/login',
  'needs-mfa-enrolment': '/mfa',
  'needs-mfa-verification': '/mfa',
  'needs-password-change': '/account/password',
  ok: '/',
};

export function statusPath(status: AuthStatus): string {
  return STATUS_PATHS[status];
}
