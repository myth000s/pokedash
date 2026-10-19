import type { z } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export interface FetchJsonOptions<T> {
  schema: z.ZodType<T>;
  headers?: Record<string, string>;
  retries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_RETRY_AFTER_MS = 30_000;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('Retry-After');
  if (raw === null) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions<T>): Promise<T> {
  const {
    schema,
    headers,
    retries = 3,
    baseDelayMs = 500,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = opts;

  for (let attempt = 1; ; attempt++) {
    const backoff = baseDelayMs * 2 ** (attempt - 1);
    let res: Response;
    try {
      res = await fetchImpl(url, { headers });
    } catch (err) {
      if (attempt > retries) throw err;
      await sleep(backoff);
      continue;
    }
    if (res.ok) return schema.parse(await res.json());
    const failure = new HttpError(res.status, url);
    if ((res.status !== 429 && res.status < 500) || attempt > retries) throw failure;
    await sleep(retryAfterMs(res) ?? backoff);
  }
}
