export type ProductKind = 'single' | 'sealed';
export type Marketplace = 'cardtrader' | 'ebay';
export type Condition = 'mint' | 'near_mint' | 'slightly_played' | 'moderately_played' | 'played' | 'poor';
export type Edition = 'first_edition' | 'shadowless' | 'unlimited';
export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface PriceGuideCents {
  avg: number | null; low: number | null; trend: number | null;
  avg1: number | null; avg7: number | null; avg30: number | null;
  avgHolo: number | null; lowHolo: number | null; trendHolo: number | null;
  avg1Holo: number | null; avg7Holo: number | null; avg30Holo: number | null;
}

export interface BenchmarkSnapshot extends PriceGuideCents { capturedAt: Date }

export interface BenchmarkAssessment {
  valueCents: number | null; basis: 'trend' | 'trend_holo' | 'en_de_offers';
  confidence: Confidence; reasons: string[]; capturedAt: Date;
}

export interface NormalizedListing {
  marketplace: Marketplace; externalId: string; cardmarketProductId: number;
  title: string; url: string; priceCents: number; currency: string;
  shippingCents: number | null; condition: Condition | null; language: string | null;
  isReverseHolo: boolean; sellerCountry: string | null;
  imageUrl: string | null;
  edition: Edition; rarity: string | null;
}

export interface ScoredListing {
  deliveredCents: number; shippingKnown: boolean;
  discountCents: number | null; discountPct: number | null;
  isDeal: boolean; warnings: string[]; notDealReasons: string[];
}
