import type { NormalizedListing } from '@/domain/types';

export function makeListing(over: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    marketplace: 'cardtrader',
    externalId: 'ct-1',
    cardmarketProductId: 895551,
    title: '30th Celebration Elite Trainer Box',
    url: 'https://www.cardtrader.com/cards/1001',
    priceCents: 9900,
    currency: 'EUR',
    shippingCents: null,
    condition: null,
    language: 'de',
    isReverseHolo: false,
    sellerName: 'seller1',
    sellerCountry: 'DE',
    ...over,
  };
}
