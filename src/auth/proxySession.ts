import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SessionClaims } from './state';

/**
 * Refreshes the Supabase session for a request (getClaims renews expired tokens) and
 * returns the response carrying any refreshed cookies. Fails closed: missing config or any
 * error yields `claims: null`.
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; claims: SessionClaims | null }> {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response, claims: null };

  try {
    const supabase = createServerClient(url, key, {
      cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          // Refreshed-session responses must never be cached by a CDN.
          for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
        },
      },
    });
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return { response, claims: null };
    const { sub, aal, user_metadata } = data.claims;
    return {
      response,
      claims: { sub, aal, user_metadata: { must_change_password: user_metadata?.must_change_password === true } },
    };
  } catch {
    return { response, claims: null };
  }
}
