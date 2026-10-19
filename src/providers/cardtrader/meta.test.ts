import { describe, it, expect } from 'vitest';
import { collectProductMeta } from './meta';
import { ctBlueprint } from '../../../test/fixtures/cardtrader';

const tracked = new Set([909509, 909510, 895551]);

describe('collectProductMeta', () => {
  it('takes the image and the single TCGplayer id of a product', () => {
    expect(collectProductMeta([
      ctBlueprint({ id: 2, card_market_ids: [895551], tcg_player_id: 704143, image_url: 'https://cardtrader.com/b.jpg' }),
      ctBlueprint({ id: 1, card_market_ids: [895551], tcg_player_id: 704143, image_url: null }),
    ], tracked)).toEqual([{ cardmarketProductId: 895551, imageUrl: 'https://cardtrader.com/b.jpg', tcgplayerId: 704143 }]);
  });
  it('uses no TCGplayer id when a product has two different ones', () => {
    expect(collectProductMeta([
      ctBlueprint({ id: 1, card_market_ids: [909509], tcg_player_id: 1 }),
      ctBlueprint({ id: 2, card_market_ids: [909509], tcg_player_id: 2 }),
    ], tracked)[0].tcgplayerId).toBeNull();
  });
  it('drops a TCGplayer id that maps to two products', () => {
    const meta = collectProductMeta([
      ctBlueprint({ id: 1, card_market_ids: [909509], tcg_player_id: 7 }),
      ctBlueprint({ id: 2, card_market_ids: [909510], tcg_player_id: 7 }),
    ], tracked);
    expect(meta.map((m) => m.tcgplayerId)).toEqual([null, null]);
  });
  it('ignores blueprints that match no or several tracked products, and unsafe images', () => {
    expect(collectProductMeta([
      ctBlueprint({ id: 1, card_market_ids: [123] }),
      ctBlueprint({ id: 2, card_market_ids: [909509, 909510] }),
      ctBlueprint({ id: 3, card_market_ids: [895551], image_url: 'http://evil.example/x.jpg', tcg_player_id: null }),
    ], tracked)).toEqual([{ cardmarketProductId: 895551, imageUrl: null, tcgplayerId: null }]);
  });
});
