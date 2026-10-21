import { describe, expect, it } from 'vitest';
import { securityHeaders } from './securityHeaders';

const csp = (dev: boolean) =>
  securityHeaders({ dev }).find((h) => h.key === 'Content-Security-Policy')!.value;

describe('securityHeaders', () => {
  it('sets a strict CSP in production', () => {
    for (const d of [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ])
      expect(csp(false)).toContain(d);
    expect(csp(false)).not.toContain('unsafe-eval');
    expect(csp(false)).not.toContain('blob:');
  });
  it('allows eval only in dev and skips the https upgrade there', () => {
    expect(csp(true)).toContain("'unsafe-eval'");
    expect(csp(true)).not.toContain('upgrade-insecure-requests');
  });
  it('sets the other headers', () => {
    expect(Object.fromEntries(securityHeaders({ dev: false }).map((h) => [h.key, h.value]))).toMatchObject({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    expect(securityHeaders({ dev: true }).some((h) => h.key === 'Strict-Transport-Security')).toBe(false);
  });
});
