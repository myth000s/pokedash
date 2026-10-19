import { describe, it, expect } from 'vitest';
import { normalizeCtProduct } from './normalize';
import { ctBlueprint, ctProduct } from '../../../test/fixtures/cardtrader';

const tracked = new Set([907672, 909509, 909510, 895551]);

describe('normalizeCtProduct', () => {
  it('maps a near-mint English card to its Cardmarket product', () => {
    expect(normalizeCtProduct(ctProduct(), ctBlueprint(), tracked)).toEqual({ listing: {
      marketplace: 'cardtrader', externalId: '777', cardmarketProductId: 909509, title: 'Mew',
      url: 'https://www.cardtrader.com/cards/1001', priceCents: 200000, currency: 'EUR', shippingCents: null,
      condition: 'near_mint', language: 'en', isReverseHolo: false, sellerName: 'seller1', sellerCountry: 'DE',
    } });
  });
  it('picks the right product when names collide', () => {
    const r = normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [909510] }), tracked);
    expect(r).toMatchObject({ listing: { cardmarketProductId: 909510 } });
  });
  it('uses the one tracked id when a blueprint lists several', () => {
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [123, 909509] }), tracked))
      .toMatchObject({ listing: { cardmarketProductId: 909509 } });
  });
  it('skips offers it cannot match exactly', () => {
    expect(normalizeCtProduct(ctProduct(), undefined, tracked)).toEqual({ skip: 'Unknown blueprint' });
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [] }), tracked)).toEqual({ skip: 'No Cardmarket match' });
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [909509, 909510] }), tracked)).toEqual({ skip: 'Ambiguous Cardmarket match' });
  });
  it('skips an offer without a language instead of assuming English', () => {
    const p = ctProduct({ properties_hash: { condition: 'Near Mint' } });
    expect(normalizeCtProduct(p, ctBlueprint(), tracked)).toEqual({ skip: 'Missing language' });
  });
  it('skips graded cards, sellers on vacation, bundles and empty stock', () => {
    expect(normalizeCtProduct(ctProduct({ graded: true }), ctBlueprint(), tracked)).toEqual({ skip: 'Graded card' });
    expect(normalizeCtProduct(ctProduct({ on_vacation: true }), ctBlueprint(), tracked)).toEqual({ skip: 'Seller on vacation' });
    expect(normalizeCtProduct(ctProduct({ bundle_size: 4 }), ctBlueprint(), tracked)).toEqual({ skip: 'Sold as a bundle' });
    expect(normalizeCtProduct(ctProduct({ quantity: 0 }), ctBlueprint(), tracked)).toEqual({ skip: 'Out of stock' });
  });
  it('gives sealed products without a condition a null condition', () => {
    const p = ctProduct({ properties_hash: { pokemon_language: 'de' } });
    expect(normalizeCtProduct(p, ctBlueprint({ card_market_ids: [895551] }), tracked))
      .toMatchObject({ listing: { condition: null, language: 'de', cardmarketProductId: 895551 } });
  });
  it('reads the reverse-holo flag', () => {
    const p = ctProduct({ properties_hash: { condition: 'Near Mint', pokemon_language: 'en', pokemon_reverse: true } });
    expect(normalizeCtProduct(p, ctBlueprint(), tracked)).toMatchObject({ listing: { isReverseHolo: true } });
  });
});
