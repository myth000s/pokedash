import type { SessionClaims } from './state';

export const PUBLIC_PATHS = ['/login', '/impressum', '/datenschutz', '/robots.txt'];

export type ProxyDecision = { action: 'next' } | { action: 'redirect'; to: string } | { action: 'unauthorized' };

function isPublic(pathname: string): boolean {
  // Exact match, or with one trailing slash. Never a prefix match.
  return PUBLIC_PATHS.some((p) => pathname === p || pathname === `${p}/`);
}

/** First-gate routing from verified claims. Pages re-check auth themselves. */
export function proxyDecision(pathname: string, claims: SessionClaims | null): ProxyDecision {
  if (isPublic(pathname)) return { action: 'next' };
  if (pathname.startsWith('/api/') && claims?.aal !== 'aal2') return { action: 'unauthorized' };
  if (!claims) return { action: 'redirect', to: '/login' };
  if (claims.aal !== 'aal2') {
    return pathname === '/mfa' ? { action: 'next' } : { action: 'redirect', to: '/mfa' };
  }
  if (claims.user_metadata?.must_change_password === true && pathname !== '/account/password') {
    return { action: 'redirect', to: '/account/password' };
  }
  return { action: 'next' };
}
