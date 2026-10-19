import type { DealView } from '@/deals/feed';
import { formatAge, formatEuro, formatPct } from '@/lib/format';
import { CONDITION_LABELS, CONFIDENCE_LABELS, MARKETPLACE_LABELS, splitProductName } from '@/lib/names';
import { CardImage } from './CardImage';

export function DealTile({ deal, now }: { deal: DealView; now: Date }) {
  const { benchmark, score } = deal;
  const { title, detail } = splitProductName(deal.productName);
  const marketplace = MARKETPLACE_LABELS[deal.marketplace];
  const warnings = score.warnings.filter((w) => w !== 'Shipping not included');
  const meta = [
    deal.language?.toUpperCase(),
    deal.condition ? CONDITION_LABELS[deal.condition] : null,
    deal.sellerCountry ? `Seller ${deal.sellerCountry}` : null,
    deal.isReverseHolo ? 'Reverse Holo' : null,
  ].filter(Boolean).join(' · ');
  return (
    <a
      href={deal.url}
      target="_blank"
      rel="noopener noreferrer"
      title={deal.productName}
      aria-label={`View ${title} on ${marketplace}`}
      className="flex min-h-11 flex-col gap-2 rounded-[14px] border border-white/[0.13] bg-white/[0.06] p-2.5 hover:border-white/30"
    >
      <CardImage key={deal.imageUrl ?? 'none'} src={deal.imageUrl} alt={deal.productName} />
      <h3 className="line-clamp-2 text-sm font-bold leading-tight">{title}</h3>
      {detail && <p className="line-clamp-1 text-xs text-mute">{detail}</p>}
      <p className="text-xs text-mute">{meta}</p>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-lg">{formatEuro(deal.priceCents)}</span>
        {benchmark.valueCents !== null && <s className="text-xs text-mute"><span className="sr-only">market value </span>{formatEuro(benchmark.valueCents)}</s>}
      </div>
      <div className="flex items-center justify-between gap-2">
        {score.discountCents !== null && score.discountPct !== null && (
          <span className="rounded-full border border-mint/45 bg-mint/15 px-2.5 py-0.5 font-display text-xs text-[#8ff0cf]">
            {`${formatEuro(score.discountCents)} · −${formatPct(score.discountPct)}`}
          </span>
        )}
        <span className="text-xs text-mute">{formatAge(deal.lastSeenAt, now)}</span>
      </div>
      {benchmark.confidence !== 'high' && <p className="text-xs text-mute">{CONFIDENCE_LABELS[benchmark.confidence]}</p>}
      {warnings.map((w) => (
        <p key={w} className="text-xs text-amber-300">{w}</p>
      ))}
    </a>
  );
}
