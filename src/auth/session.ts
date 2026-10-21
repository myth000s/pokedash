import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/auth/supabase';
import { resolveAuthState, statusPath, type AuthState, type AuthStatus, type SessionClaims } from '@/auth/state';

/** The signed-in user's state, from verified JWT claims. Anything unexpected means anonymous. */
export async function getAuthState(): Promise<AuthState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: 'anonymous' };
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { status: 'anonymous' };
  const { sub, aal, user_metadata } = data.claims;
  const claims: SessionClaims = {
    sub,
    aal,
    user_metadata: { must_change_password: user_metadata?.must_change_password === true },
  };
  let nextLevel: 'aal1' | 'aal2' | null = null;
  if (aal !== 'aal2') {
    const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (levels?.nextLevel === 'aal2') nextLevel = 'aal2';
    else if (levels?.nextLevel === 'aal1') nextLevel = 'aal1';
  }
  return resolveAuthState(claims, nextLevel);
}

/** Returns the auth state if its status is allowed, otherwise redirects to the page for that status. */
export async function requireAuthState(allowed: AuthStatus[]): Promise<AuthState> {
  const state = await getAuthState();
  if (!allowed.includes(state.status)) redirect(statusPath(state.status));
  return state;
}

export function requireAal2(): Promise<AuthState> {
  return requireAuthState(['ok']);
}
