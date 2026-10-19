import type { ProductMeta } from '../types';
import { safeCardTraderImageUrl } from './normalize';
import type { CtBlueprint } from './schema';

// Picture and TCGplayer id per tracked product, from CardTrader's blueprints.
export function collectProductMeta(blueprints: CtBlueprint[], tracked: ReadonlySet<number>): ProductMeta[] {
  const byProduct = new Map<number, CtBlueprint[]>();
  for (const b of [...blueprints].sort((x, y) => x.id - y.id)) {
    const matches = b.card_market_ids.filter((id) => tracked.has(id));
    if (matches.length !== 1) continue;
    const list = byProduct.get(matches[0]) ?? [];
    list.push(b);
    byProduct.set(matches[0], list);
  }

  const meta: ProductMeta[] = [...byProduct]
    .sort(([a], [b]) => a - b)
    .map(([cardmarketProductId, bps]) => {
      const ids = new Set(bps.flatMap((b) => (b.tcg_player_id == null ? [] : [b.tcg_player_id])));
      return {
        cardmarketProductId,
        imageUrl: bps.map((b) => safeCardTraderImageUrl(b.image_url)).find((u) => u !== null) ?? null,
        tcgplayerId: ids.size === 1 ? [...ids][0] : null,
      };
    });

  // A TCGplayer id shared by several products can't identify any of them.
  const owners = new Map<number, number>();
  for (const m of meta) if (m.tcgplayerId !== null) owners.set(m.tcgplayerId, (owners.get(m.tcgplayerId) ?? 0) + 1);
  for (const m of meta) if (m.tcgplayerId !== null && owners.get(m.tcgplayerId)! > 1) m.tcgplayerId = null;
  return meta;
}
