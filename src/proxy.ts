import { NextResponse, type NextRequest } from 'next/server';
import { proxyDecision } from '@/auth/paths';
import { updateSession } from '@/auth/proxySession';

export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const decision = proxyDecision(request.nextUrl.pathname, claims);

  if (decision.action === 'unauthorized') return new NextResponse(null, { status: 401 });
  if (decision.action === 'redirect') {
    const redirect = NextResponse.redirect(new URL(decision.to, request.url));
    // A refreshed or cleared session must survive the redirect, with its no-store headers.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const h of ['cache-control', 'expires', 'pragma']) {
      const v = response.headers.get(h);
      if (v) redirect.headers.set(h, v);
    }
    return redirect;
  }
  return response;
}

// Skips only build assets, the image endpoint and the favicon itself; anything else, such as
// /favicon.ico/x or /_next/staticX, still runs the proxy. `[.]` keeps the dot literal: the
// matcher's path parser drops a `\.` escape. Pinned by proxy.test.ts.
export const config = {
  matcher: ['/((?!_next/static/|_next/image$|favicon[.]ico$).*)'],
};
