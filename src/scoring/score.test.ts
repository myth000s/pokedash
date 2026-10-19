import { describe, it, expect } from 'vitest';
import { markStaleListing, scoreListing, type ScoreInput } from './score';
import { DEFAULT_DEAL_SETTINGS as S } from '@/config/settings';
import type { BenchmarkAssessment, Confidence } from '@/domain/types';

const bm = (valueCents: number | null, confidence: Confidence = 'high'): BenchmarkAssessment => ({
  valueCents, basis: 'trend', confidence, reasons: [], capturedAt: new Date('2026-10-19T00:42:46Z'),
});
const etb: ScoreInput = { priceCents: 9900, shippingCents: 599, currency: 'EUR', condition: null, language: 'de', kind: 'sealed' };
const mew: ScoreInput = { priceCents: 200000, shippingCents: null, currency: 'EUR', condition: 'near_mint', language: 'en', kind: 'single' };

describe('scoreListing', () => {
  it('flags a sealed product 21% below market value as a deal', () => {
    const s = scoreListing(etb, bm(13295), S);
    expect(s).toMatchObject({ deliveredCents: 10499, shippingKnown: true, discountCents: 2796, isDeal: true, warnings: [], notDealReasons: [] });
    expect(s.discountPct).toBeCloseTo(0.2103, 4);
  });
  it('explains when the discount is too small', () => {
    const s = scoreListing({ ...etb, priceCents: 11000 }, bm(13295), S);
    expect(s.isDeal).toBe(false);
    expect(s.notDealReasons).toEqual(['Only 13% below market value (needs 20%)']);
  });
  it('warns when shipping is unknown and uses the item price alone', () => {
    const s = scoreListing({ ...etb, shippingCents: null }, bm(13295), S);
    expect(s).toMatchObject({ deliveredCents: 9900, shippingKnown: false, isDeal: true, warnings: ['Shipping not included'] });
  });
  it('accepts a near-mint English single', () => {
    const s = scoreListing(mew, bm(316053), S);
    expect(s.isDeal).toBe(true);
    expect(s.discountPct).toBeCloseTo(0.3672, 4);
  });
  it('rejects singles below Near Mint', () => {
    expect(scoreListing({ ...mew, condition: 'slightly_played' }, bm(316053), S).notDealReasons).toEqual(['Condition below Near Mint']);
    expect(scoreListing({ ...mew, condition: null }, bm(316053), S).notDealReasons).toEqual(['Condition unknown']);
  });
  it('rejects languages not on the list', () => {
    expect(scoreListing({ ...mew, language: 'fr' }, bm(316053), S).notDealReasons).toEqual(['Language fr is not on your list']);
    expect(scoreListing({ ...mew, language: null }, bm(316053), S).notDealReasons).toEqual(['Language unknown']);
  });
  it('ignores cheap bulk', () => {
    expect(scoreListing({ ...etb, priceCents: 100, shippingCents: 0 }, bm(450), S).notDealReasons).toContain('Market value under €5');
  });
  it('rejects unreliable or missing market values', () => {
    expect(scoreListing(etb, bm(13295, 'low'), S).notDealReasons).toEqual(['Market value is unreliable']);
    expect(scoreListing(etb, bm(null, 'insufficient'), S)).toMatchObject({
      discountCents: null, discountPct: null, isDeal: false, notDealReasons: ['Not enough sales data'],
    });
  });
  it('warns about suspiciously cheap deals but keeps them', () => {
    const s = scoreListing({ ...etb, priceCents: 4000 }, bm(13295), S);
    expect(s.isDeal).toBe(true);
    expect(s.warnings).toEqual(['Unusually cheap: check the listing carefully']);
  });
  it('rejects listings priced above market value', () => {
    const s = scoreListing({ ...etb, priceCents: 15000 }, bm(13295), S);
    expect(s).toMatchObject({ discountCents: -2304, isDeal: false, notDealReasons: ['Priced above market value'] });
  });
  it('does not score non-EUR prices', () => {
    expect(scoreListing({ ...etb, currency: 'USD' }, bm(13295), S)).toMatchObject({
      discountCents: null, discountPct: null, isDeal: false, notDealReasons: ['Price is not in EUR'],
    });
  });
});

describe('markStaleListing', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const seenHoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it('removes the deal flag from a listing not seen for more than 3 days', () => {
    const deal = scoreListing(etb, bm(13295), S);
    const s = markStaleListing(deal, seenHoursAgo(80), now, S.maxListingAgeHours);
    expect(s.isDeal).toBe(false);
    expect(s.notDealReasons.at(-1)).toBe('Listing not seen for 3 days');
  });
  it('leaves a listing seen within 3 days unchanged', () => {
    const deal = scoreListing(etb, bm(13295), S);
    const s = markStaleListing(deal, seenHoursAgo(70), now, S.maxListingAgeHours);
    expect(s).toEqual(deal);
    expect(s.isDeal).toBe(true);
  });
});
