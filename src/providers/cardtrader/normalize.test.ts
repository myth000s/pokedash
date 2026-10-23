import { describe, it, expect } from 'vitest';
import { normalizeCtProduct, safeCardTraderImageUrl } from './normalize';
import { ctBlueprintSchema, ctExpansionSchema, ctProductSchema } from './schema';
import { ctBlueprint, ctProduct } from '../../../test/fixtures/cardtrader';
import { THIRTIETH_CELEBRATION, findSet } from '@/config/sets';

const tracked = new Set([907672, 909509, 909510, 895551]);
const ctx = { set: THIRTIETH_CELEBRATION, expansionId: 501 };
const baseCtx = { set: findSet('base-set')!, expansionId: 1472 };
const shadowlessCtx = { set: findSet('base-set')!, expansionId: 1969 };
const base2Ctx = { set: findSet('base-set-2')!, expansionId: 1478 };
const withFirst = (first: boolean, extra: Record<string, string | boolean> = {}) =>
  ctProduct({ properties_hash: { condition: 'Near Mint', pokemon_language: 'en', first_edition: first, ...extra } });

describe('normalizeCtProduct', () => {
  it('maps a near-mint English card to its Cardmarket product', () => {
    expect(normalizeCtProduct(ctProduct(), ctBlueprint(), tracked, ctx)).toEqual({ listing: {
      marketplace: 'cardtrader', externalId: '777', cardmarketProductId: 909509, title: 'Mew',
      url: 'https://www.cardtrader.com/cards/1001', priceCents: 200000, currency: 'EUR', shippingCents: null,
      condition: 'near_mint', language: 'en', isReverseHolo: false, sellerCountry: 'DE',
      imageUrl: null, edition: 'unlimited', rarity: null,
    } });
  });
  it("keeps the seller's country but not their user name", () => {
    const product = ctProductSchema.parse({ ...ctProduct(), user: { username: 'seller-handle-42', country_code: 'FR' } });
    const result = normalizeCtProduct(product, ctBlueprint(), tracked, ctx);
    expect(result).toMatchObject({ listing: { sellerCountry: 'FR' } });
    expect(JSON.stringify(result)).not.toContain('seller-handle-42');
    // An offer without a user name is fine: it is never needed.
    expect(ctProductSchema.parse({ ...ctProduct(), user: { country_code: 'DE' } }).user.country_code).toBe('DE');
  });
  it('keeps CardTrader picture links and uses null when there is none', () => {
    const ok = 'https://cardtrader.com/uploads/blueprints/image/413227/preview_413227-raikou.jpg';
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ image_url: ok }), tracked, ctx)).toMatchObject({ listing: { imageUrl: ok } });
    expect(normalizeCtProduct(ctProduct(), ctBlueprint(), tracked, ctx)).toMatchObject({ listing: { imageUrl: null } });
  });
  it('rejects unsafe picture links', () => {
    for (const bad of ['http://cardtrader.com/x.jpg', 'https://evil.example/x.jpg', 'javascript:alert(1)',
      'https://cardtrader.com.evil.example/x.jpg', 'https://user:pw@cardtrader.com/x.jpg', 'https://cardtrader.com:8443/x.jpg', 'not a url', '', 42, null, undefined]) {
      expect(safeCardTraderImageUrl(bad)).toBeNull();
    }
    expect(safeCardTraderImageUrl('https://www.cardtrader.com/uploads/a.jpg')).toBe('https://www.cardtrader.com/uploads/a.jpg');
  });
  it('picks the right product when names collide', () => {
    const r = normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [909510] }), tracked, ctx);
    expect(r).toMatchObject({ listing: { cardmarketProductId: 909510 } });
  });
  it('uses the one tracked id when a blueprint lists several', () => {
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [123, 909509] }), tracked, ctx))
      .toMatchObject({ listing: { cardmarketProductId: 909509 } });
  });
  it('skips offers it cannot match exactly', () => {
    expect(normalizeCtProduct(ctProduct(), undefined, tracked, ctx)).toEqual({ skip: 'Unknown blueprint' });
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [] }), tracked, ctx)).toEqual({ skip: 'No Cardmarket match' });
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [909509, 909510] }), tracked, ctx)).toEqual({ skip: 'Ambiguous Cardmarket match' });
  });
  it('skips an offer without a language instead of assuming English', () => {
    const p = ctProduct({ properties_hash: { condition: 'Near Mint' } });
    expect(normalizeCtProduct(p, ctBlueprint(), tracked, ctx)).toEqual({ skip: 'Missing language' });
  });
  it('skips graded cards, sellers on vacation, bundles and empty stock', () => {
    expect(normalizeCtProduct(ctProduct({ graded: true }), ctBlueprint(), tracked, ctx)).toEqual({ skip: 'Graded card' });
    expect(normalizeCtProduct(ctProduct({ on_vacation: true }), ctBlueprint(), tracked, ctx)).toEqual({ skip: 'Seller on vacation' });
    expect(normalizeCtProduct(ctProduct({ bundle_size: 4 }), ctBlueprint(), tracked, ctx)).toEqual({ skip: 'Sold as a bundle' });
    expect(normalizeCtProduct(ctProduct({ quantity: 0 }), ctBlueprint(), tracked, ctx)).toEqual({ skip: 'Out of stock' });
  });
  it('skips altered and signed offers', () => {
    const base = { condition: 'Near Mint', pokemon_language: 'en' };
    const run = (extra: Record<string, boolean>) =>
      normalizeCtProduct(ctProduct({ properties_hash: { ...base, ...extra } }), ctBlueprint(), tracked, ctx);
    expect(run({ altered: true })).toEqual({ skip: 'Altered card' });
    expect(run({ signed: true })).toEqual({ skip: 'Signed card' });
    expect(run({ altered: false, signed: false })).toHaveProperty('listing');
  });
  it("keeps sealed products whatever CardTrader's sealed flag says", () => {
    for (const sealed of [false, true]) {
      const r = normalizeCtProduct(ctProduct({ properties_hash: { condition: 'Near Mint', pokemon_language: 'en', sealed } }), ctBlueprint(), tracked, ctx);
      expect(r).toHaveProperty('listing');
    }
  });
  it('tolerates a missing seller country and null card_market_ids', () => {
    const product = ctProductSchema.parse({
      id: 1, blueprint_id: 1001, name_en: 'Mew', quantity: 1,
      price: { cents: 500, currency: 'EUR' },
      properties_hash: { pokemon_language: 'en' },
      user: { username: 'u' },
    });
    const bp = ctBlueprintSchema.parse({ id: 1001, name: 'Mew', expansion_id: 501, card_market_ids: null });
    expect(bp.card_market_ids).toEqual([]);
    expect(ctBlueprintSchema.parse({ id: 1, name: 'x', expansion_id: 1 }).card_market_ids).toEqual([]);
    const withIds = { ...bp, card_market_ids: [909509] };
    expect(normalizeCtProduct(product, withIds, tracked, ctx)).toMatchObject({ listing: { sellerCountry: null } });
    expect(ctExpansionSchema.parse({ id: 1, game_id: 5, name: 'x' }).code).toBeUndefined();
    expect(() => ctProductSchema.parse({ ...product, price: { cents: 5.5, currency: 'EUR' } })).toThrow();
  });
  it('gives sealed products without a condition a null condition', () => {
    const p = ctProduct({ properties_hash: { pokemon_language: 'de' } });
    expect(normalizeCtProduct(p, ctBlueprint({ card_market_ids: [895551] }), tracked, ctx))
      .toMatchObject({ listing: { condition: null, language: 'de', cardmarketProductId: 895551 } });
  });
  it('reads the reverse-holo flag', () => {
    const p = ctProduct({ properties_hash: { condition: 'Near Mint', pokemon_language: 'en', pokemon_reverse: true } });
    expect(normalizeCtProduct(p, ctBlueprint(), tracked, ctx)).toMatchObject({ listing: { isReverseHolo: true } });
  });
  it('derives the edition from the flag, the set and the expansion', () => {
    const ed = (p: ReturnType<typeof withFirst>, c: typeof baseCtx) => normalizeCtProduct(p, ctBlueprint(), tracked, c);
    expect(ed(withFirst(true), baseCtx)).toMatchObject({ listing: { edition: 'first_edition' } });
    expect(ed(withFirst(false), baseCtx)).toMatchObject({ listing: { edition: 'unlimited' } });
    expect(ed(withFirst(false), shadowlessCtx)).toMatchObject({ listing: { edition: 'shadowless' } });
    expect(ed(withFirst(true), shadowlessCtx)).toMatchObject({ listing: { edition: 'first_edition' } });
    expect(ed(withFirst(true), base2Ctx)).toMatchObject({ listing: { edition: 'unlimited' } });
  });
  it('reads the rarity', () => {
    expect(normalizeCtProduct(withFirst(false, { pokemon_rarity: 'Holo Rare' }), ctBlueprint(), tracked, baseCtx))
      .toMatchObject({ listing: { rarity: 'Holo Rare' } });
    expect(normalizeCtProduct(withFirst(false), ctBlueprint(), tracked, baseCtx)).toMatchObject({ listing: { rarity: null } });
  });
});
