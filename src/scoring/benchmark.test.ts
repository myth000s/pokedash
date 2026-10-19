import { describe, it, expect } from 'vitest';
import { assessBenchmark } from './benchmark';
import type { BenchmarkSnapshot } from '@/domain/types';

const NOW = new Date('2026-10-19T12:00:00Z');
const FRESH = new Date('2026-10-19T00:42:46Z');
const snap = (over: Partial<BenchmarkSnapshot>): BenchmarkSnapshot => ({
  capturedAt: FRESH, avg: null, low: null, trend: null, avg1: null, avg7: null, avg30: null,
  avgHolo: null, lowHolo: null, trendHolo: null, avg1Holo: null, avg7Holo: null, avg30Holo: null, ...over,
});
const single = { kind: 'single' as const, reverseHolo: false, now: NOW, maxAgeHours: 72 };
const sealed = { ...single, kind: 'sealed' as const };

describe('assessBenchmark', () => {
  it('rates a single with steady recent sales as high confidence', () => {
    expect(assessBenchmark(snap({ trend: 316053, avg7: 306574, avg30: 299938 }), single))
      .toEqual({ valueCents: 316053, basis: 'trend', confidence: 'high', reasons: [], capturedAt: FRESH });
  });
  it('drops to medium when a recent average is missing', () => {
    const a = assessBenchmark(snap({ trend: 316053, avg7: null, avg30: 299938 }), single);
    expect(a.confidence).toBe('medium');
    expect(a.reasons).toEqual(['Few recent sales']);
  });
  it('drops to medium when recent sales vary 25–50% from the trend', () => {
    const a = assessBenchmark(snap({ trend: 10000, avg7: 13000, avg30: 10000 }), single);
    expect(a.confidence).toBe('medium');
    expect(a.reasons).toEqual(['Recent sales vary from the trend']);
  });
  it('drops to low when recent sales differ by more than 50%', () => {
    const a = assessBenchmark(snap({ trend: 10000, avg7: 10000, avg30: 16000 }), single);
    expect(a.confidence).toBe('low');
    expect(a.reasons).toEqual(['Recent sales differ a lot from the trend']);
  });
  it('checks sealed products against the average sell price', () => {
    expect(assessBenchmark(snap({ trend: 13295, avg: 15045 }), sealed).confidence).toBe('high');
    expect(assessBenchmark(snap({ trend: 2992, avg: 3986 }), sealed).confidence).toBe('medium');
  });
  it('reports insufficient data when there is no trend', () => {
    expect(assessBenchmark(snap({ avg: 15045 }), sealed)).toMatchObject({
      valueCents: null, confidence: 'insufficient', reasons: ['No sales-based market price'],
    });
  });
  it('uses reverse-holo prices for reverse-holo cards', () => {
    const a = assessBenchmark(
      snap({ trend: 13, trendHolo: 49, avg7Holo: 36, avg30Holo: 54 }),
      { ...single, reverseHolo: true },
    );
    expect(a).toMatchObject({ valueCents: 49, basis: 'trend_holo', confidence: 'medium' });
  });
  it('treats price data older than 3 days as unreliable', () => {
    const old = new Date(NOW.getTime() - 80 * 3_600_000);
    const a = assessBenchmark(snap({ capturedAt: old, trend: 316053, avg7: 306574, avg30: 299938 }), single);
    expect(a.confidence).toBe('low');
    expect(a.reasons).toEqual(['Price data is 3 days old']);
  });
  it('keeps price data up to 3 days old', () => {
    const recent = new Date(NOW.getTime() - 70 * 3_600_000);
    const a = assessBenchmark(snap({ capturedAt: recent, trend: 316053, avg7: 306574, avg30: 299938 }), single);
    expect(a.confidence).toBe('high');
    expect(a.reasons).toEqual([]);
  });
  it('missing trend stays insufficient even when old', () => {
    const old = new Date(NOW.getTime() - 80 * 3_600_000);
    expect(assessBenchmark(snap({ capturedAt: old, avg: 15045 }), sealed).confidence).toBe('insufficient');
  });
  it('never uses the lowest asking price', () => {
    const a = assessBenchmark(snap({ trend: 13295, avg: 15045, low: 8990 }), sealed);
    expect(a).toMatchObject({ valueCents: 13295, confidence: 'high' });
  });
});
