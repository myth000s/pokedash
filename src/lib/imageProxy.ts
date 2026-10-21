import { safeCardTraderImageUrl } from '@/providers/cardtrader/normalize';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export type CardImageResult =
  | { ok: true; body: Uint8Array; contentType: string }
  | { ok: false; status: 400 | 502 };

const BAD_GATEWAY = { ok: false, status: 502 } as const;

/** Fetches a CardTrader picture on the server. Every hop is re-validated; redirects are never followed blindly. */
export async function fetchCardImage(src: string, fetchFn: typeof fetch): Promise<CardImageResult> {
  let current = safeCardTraderImageUrl(src);
  if (!current) return { ok: false, status: 400 };
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchFn(current, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        const location = res.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) return BAD_GATEWAY;
        let next: string;
        try { next = new URL(location, current).toString(); } catch { return BAD_GATEWAY; }
        const safe = safeCardTraderImageUrl(next);
        if (!safe) return BAD_GATEWAY;
        current = safe;
        continue;
      }
      if (res.status !== 200) {
        await res.body?.cancel();
        return BAD_GATEWAY;
      }
      const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
        await res.body?.cancel();
        return BAD_GATEWAY;
      }
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        await res.body?.cancel();
        return BAD_GATEWAY;
      }
      if (!res.body) return BAD_GATEWAY;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel();
          return BAD_GATEWAY;
        }
        chunks.push(value);
      }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { body.set(c, offset); offset += c.byteLength; }
      return { ok: true, body, contentType };
    }
  } catch {
    return BAD_GATEWAY;
  }
  return BAD_GATEWAY;
}
