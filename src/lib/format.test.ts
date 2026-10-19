import { describe, it, expect } from 'vitest';
import { formatEuro, formatPct, formatAge } from './format';

const now = new Date('2026-10-19T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
describe('format', () => {
  it('formats euros', () => {
    expect(formatEuro(10499)).toBe('€104.99');
    expect(formatEuro(316053)).toBe('€3,160.53');
  });
  it('formats percentages', () => expect(formatPct(0.2554)).toBe('26%'));
  it('formats ages', () => {
    expect(formatAge(ago(20_000), now)).toBe('just now');
    expect(formatAge(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatAge(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(formatAge(ago(50 * 3_600_000), now)).toBe('2 days ago');
  });
});
