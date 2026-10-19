import type { BenchmarkAssessment, NormalizedListing, ProductKind, ScoredListing } from '@/domain/types';
import type { DealSettings } from '@/config/settings';

export type ScoreInput = Pick<NormalizedListing, 'priceCents' | 'shippingCents' | 'currency' | 'condition' | 'language'> & {
  kind: ProductKind;
};

export function scoreListing(input: ScoreInput, benchmark: BenchmarkAssessment, settings: DealSettings): ScoredListing {
  const shippingKnown = input.shippingCents !== null;
  const deliveredCents = input.priceCents + (input.shippingCents ?? 0);
  const { valueCents, confidence } = benchmark;

  const canCompare = input.currency === 'EUR' && valueCents !== null;
  const discountCents = canCompare ? valueCents - deliveredCents : null;
  const discountPct = canCompare && discountCents !== null ? discountCents / valueCents : null;

  const notDealReasons: string[] = [];
  if (confidence === 'insufficient') notDealReasons.push('Not enough sales data');
  else if (confidence === 'low') notDealReasons.push('Market value is unreliable');

  if (input.currency !== 'EUR') notDealReasons.push('Price is not in EUR');
  if (canCompare && valueCents < settings.minBenchmarkCents) {
    notDealReasons.push(`Market value under €${settings.minBenchmarkCents / 100}`);
  }

  if (input.language === null) notDealReasons.push('Language unknown');
  else if (!settings.languages.includes(input.language)) {
    notDealReasons.push(`Language ${input.language} is not on your list`);
  }

  if (input.kind === 'single') {
    if (input.condition === null) notDealReasons.push('Condition unknown');
    else if (!settings.dealConditions.includes(input.condition)) notDealReasons.push('Condition below Near Mint');
  }

  if (discountPct !== null) {
    if (discountPct < 0) notDealReasons.push('Priced above market value');
    else if (discountPct < settings.minDiscountPct) {
      notDealReasons.push(
        `Only ${Math.round(discountPct * 100)}% below market value (needs ${Math.round(settings.minDiscountPct * 100)}%)`,
      );
    }
  }

  const warnings: string[] = [];
  if (!shippingKnown) warnings.push('Shipping not included');
  if (discountPct !== null && discountPct >= settings.suspiciousDiscountPct) {
    warnings.push('Unusually cheap: check the listing carefully');
  }

  return {
    deliveredCents, shippingKnown, discountCents, discountPct,
    isDeal: notDealReasons.length === 0, warnings, notDealReasons,
  };
}
