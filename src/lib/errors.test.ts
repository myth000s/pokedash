import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { describeError } from './errors';

describe('describeError', () => {
  it('summarises a ZodError to the first 3 issues and the total', () => {
    const r = z.array(z.object({ a: z.number() })).safeParse([{}, {}, {}, {}, {}]);
    const text = describeError(r.error);
    expect(text).toContain('5 issues');
    expect(text).toContain('0.a');
    expect(text).toContain('2.a');
    expect(text).not.toContain('3.a');
    expect(text.split('\n')).toHaveLength(1);
  });
  it('passes plain error messages through', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('x')).toBe('Unknown error');
  });
});
