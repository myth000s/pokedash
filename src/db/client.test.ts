import { describe, expect, it } from 'vitest';
import { createDb } from './client';

describe('createDb', () => {
  it('disables prepared statements for the Supabase pooler', () => {
    const db = createDb('postgres://u:p@127.0.0.1:1/x');
    expect((db as unknown as { $client: { options: { prepare: boolean } } }).$client.options.prepare).toBe(false);
  });
});
