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
  timeoutMs?: number;
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

function networkError(url: string, err: unknown): Error {
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  const detail = typeof code === 'string' ? code : err instanceof Error ? err.message : 'unknown error';
  // Deliberately no headers: they may carry the API token.
  return new Error(`Network error for ${url}: ${detail}`, { cause: err });
}

type RequestOptions = Omit<FetchJsonOptions<unknown>, 'schema'>;

async function request(url: string, opts: RequestOptions): Promise<Response> {
  const {
    headers,
    retries = 3,
    baseDelayMs = 500,
    timeoutMs = 30_000,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = opts;

  for (let attempt = 1; ; attempt++) {
    const backoff = baseDelayMs * 2 ** (attempt - 1);
    let res: Response;
    try {
      res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (attempt > retries) throw networkError(url, err);
      await sleep(backoff);
      continue;
    }
    if (res.ok) return res;
    const failure = new HttpError(res.status, url);
    if ((res.status !== 429 && res.status < 500) || attempt > retries) throw failure;
    await sleep(retryAfterMs(res) ?? backoff);
  }
}

export async function fetchJsonWithHeaders<T>(
  url: string,
  opts: FetchJsonOptions<T>,
): Promise<{ data: T; headers: Headers }> {
  const res = await request(url, opts);
  return { data: opts.schema.parse(await res.json()), headers: res.headers };
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions<T>): Promise<T> {
  return (await fetchJsonWithHeaders(url, opts)).data;
}

export async function fetchText(url: string, opts: Omit<FetchJsonOptions<unknown>, 'schema'>): Promise<string> {
  return (await request(url, opts)).text();
}
