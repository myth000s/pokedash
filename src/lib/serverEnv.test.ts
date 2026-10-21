import { describe, expect, it } from 'vitest';
import { checkServerEnv, missingServerEnv } from './serverEnv';

describe('serverEnv', () => {
  it('names missing variables without values', () => {
    expect(missingServerEnv({ DATABASE_URL: 'x' })).toEqual(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']);
  });
  it('throws only on Vercel production', () => {
    expect(() => checkServerEnv({ VERCEL_ENV: 'production' })).toThrow(
      'Missing server env: DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY',
    );
    expect(() => checkServerEnv({ VERCEL_ENV: 'preview' })).not.toThrow();
  });
});
