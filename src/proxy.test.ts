import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from './proxy';

let runsProxy: (path: string) => boolean;

beforeAll(async () => {
  // Next's server sets this global; the matcher helper loads server modules that expect it.
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
  // Next's own helper compiles the matcher the way the build does (path-to-regexp, then a regex).
  const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server');
  runsProxy = (path) => unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}` });
});

describe('proxy matcher', () => {
  it.each([
    '/',
    '/login',
    '/api/card-image',
    '/api/card-image?src=https://cardtrader.com/x.jpg',
    '/favicon.ico/x',
    '/favicon.ico/',
    '/faviconXico',
    '/_next/staticX',
    '/_next/image/x',
  ])('runs the proxy for %s', (path) => expect(runsProxy(path)).toBe(true));

  it.each(['/_next/static/chunks/a.js', '/_next/static/css/app.css', '/favicon.ico', '/_next/image', '/_next/image?url=%2Fx.png'])(
    'skips the proxy for %s',
    (path) => expect(runsProxy(path)).toBe(false),
  );
});
