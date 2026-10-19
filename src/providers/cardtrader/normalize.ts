import type { NormalizedListing } from '@/domain/types';
import { CT_CONDITIONS, CT_LANGUAGE_KEY, CT_REVERSE_KEY, type CtBlueprint, type CtProduct } from './schema';

const CT_IMAGE_HOSTS = new Set(['cardtrader.com', 'www.cardtrader.com']);

// Only https links on CardTrader's own host are stored; anything else becomes null.
export function safeCardTraderImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && CT_IMAGE_HOSTS.has(u.hostname) ? raw : null;
  } catch {
    return null;
  }
}

export function normalizeCtProduct(
  p: CtProduct,
  blueprint: CtBlueprint | undefined,
  tracked: ReadonlySet<number>,
): { listing: NormalizedListing } | { skip: string } {
  if (!blueprint) return { skip: 'Unknown blueprint' };

  const matches = blueprint.card_market_ids.filter((id) => tracked.has(id));
  if (matches.length === 0) return { skip: 'No Cardmarket match' };
  if (matches.length > 1) return { skip: 'Ambiguous Cardmarket match' };

  if (p.graded) return { skip: 'Graded card' };
  if (p.on_vacation) return { skip: 'Seller on vacation' };
  if ((p.bundle_size ?? 1) !== 1) return { skip: 'Sold as a bundle' };
  if (p.quantity < 1) return { skip: 'Out of stock' };

  // Offers that aren't the plain product the market value describes.
  // (CardTrader's `sealed` flag is constant per category, so it says nothing about the offer.)
  if (p.properties_hash.altered === true) return { skip: 'Altered card' };
  if (p.properties_hash.signed === true) return { skip: 'Signed card' };

  const language = p.properties_hash[CT_LANGUAGE_KEY];
  if (typeof language !== 'string') return { skip: 'Missing language' };

  const rawCondition = p.properties_hash.condition;
  const condition = typeof rawCondition === 'string' ? (CT_CONDITIONS[rawCondition] ?? null) : null;

  return {
    listing: {
      marketplace: 'cardtrader',
      externalId: String(p.id),
      cardmarketProductId: matches[0],
      title: p.name_en,
      url: `https://www.cardtrader.com/cards/${p.blueprint_id}`,
      priceCents: p.price.cents,
      currency: p.price.currency,
      shippingCents: null,
      condition,
      language: language.toLowerCase(),
      isReverseHolo: p.properties_hash[CT_REVERSE_KEY] === true,
      sellerName: p.user.username,
      sellerCountry: p.user.country_code ?? null,
      imageUrl: safeCardTraderImageUrl(blueprint.image_url),
    },
  };
}
