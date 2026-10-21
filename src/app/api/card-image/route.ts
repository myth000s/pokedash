import type { NextRequest } from 'next/server';
import { getAuthState } from '@/auth/session';
import { fetchCardImage } from '@/lib/imageProxy';

// Auth-gated server-side fetch of CardTrader pictures, so visitors' browsers never contact CardTrader.
export async function GET(request: NextRequest) {
  const auth = await getAuthState();
  if (auth.status !== 'ok') return new Response(null, { status: 401 });
  const result = await fetchCardImage(request.nextUrl.searchParams.get('src') ?? '', fetch);
  if (!result.ok) return new Response(null, { status: result.status });
  return new Response(result.body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
