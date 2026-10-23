import type { DealView } from '@/deals/feed';
import { formatAge, formatEuro, formatPct } from '@/lib/format';
import { findSet } from '@/config/sets';
import { CONDITION_LABELS, CONFIDENCE_LABELS, EDITION_LABELS, MARKETPLACE_LABELS, splitProductName } from '@/lib/names';
import { CardImage } from './CardImage';
import { CardmarketLink } from './CardmarketLink';

function Badge({ children, good = false }: { children: string; good?: boolean }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs ${good ? 'border-mint/50 text-[#8ff0cf]' : 'border-white/[0.13] bg-white/[0.06] text-ink'}`}>
      {children}
    </span>
  );
}

export function HeroDeal({ deal, now }: { deal: DealView; now: Date }) {
  const { benchmark, score } = deal;
  const { title, detail } = splitProductName(deal.productName);
  const marketplace = MARKETPLACE_LABELS[deal.marketplace];
  const warnings = score.warnings.filter((w) => w !== 'Shipping not included');
  const subline = [detail, deal.kind === 'sealed' ? 'Sealed' : 'Single'].filter(Boolean).join(' · ');
  const shippingUnknown = deal.shippingCents === null;
  return (
    <section className="holo-ring">
      {/* p-5 keeps the 2px gold focus outline (+2px offset) of the link fully inside the ring's overflow clip. */}
      <div className="relative grid grid-cols-1 items-center gap-5 rounded-2xl bg-[rgba(10,12,30,0.93)] p-5 md:grid-cols-[200px_1fr] lg:grid-cols-[200px_1fr_230px] lg:gap-6 lg:px-6">
        <div className="mx-auto w-40 md:w-full">
          <CardImage key={deal.imageUrl ?? 'none'} src={deal.imageUrl} alt={deal.productName} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.1em] text-gold">Best deal right now</p>
          <h2 className="mt-1 line-clamp-2 font-display text-3xl leading-tight">{title}</h2>
          <p className="text-sm text-mute">{subline}</p>
          <div className="my-3 flex flex-wrap gap-1.5">
            {deal.language && <Badge>{deal.language.toUpperCase()}</Badge>}
            {deal.condition && <Badge>{CONDITION_LABELS[deal.condition]}</Badge>}
            {findSet(deal.setKey)?.era === 'vintage' && <Badge>{EDITION_LABELS[deal.edition]}</Badge>}
            {deal.isReverseHolo && <Badge>Reverse Holo</Badge>}
            <Badge>{marketplace}</Badge>
            {deal.sellerCountry && <Badge>{`Seller in ${deal.sellerCountry}`}</Badge>}
            <Badge good={benchmark.confidence === 'high'}>{CONFIDENCE_LABELS[benchmark.confidence]}</Badge>
          </div>
          {benchmark.reasons.length > 0 && <p className="text-xs text-mute">{benchmark.reasons.join(' · ')}</p>}
          <p className="text-xs text-mute">
            {`Market value from Cardmarket sales, updated ${formatAge(benchmark.capturedAt, now)} · listing seen ${formatAge(deal.lastSeenAt, now)}${shippingUnknown ? ' · shipping not included' : ''}`}
          </p>
        </div>
        <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-1 lg:items-end lg:text-right">
          {score.discountCents !== null && score.discountPct !== null && (
            <p className="w-fit rounded-xl bg-mint px-3.5 py-1.5 font-display text-2xl text-[#03241b]">
              {`${formatEuro(score.discountCents)} · −${formatPct(score.discountPct)}`}
            </p>
          )}
          <div className="text-sm text-mute">
            <p className="font-display text-2xl text-white">{formatEuro(deal.priceCents)}</p>
            <p>{deal.shippingCents === null ? 'Shipping not included' : `+ ${formatEuro(deal.shippingCents)} shipping`}</p>
            {benchmark.valueCents !== null && (
              <p className="mt-1">
                market <s className="text-mute"><span className="sr-only">market value </span>{formatEuro(benchmark.valueCents)}</s>
              </p>
            )}
          </div>
          {warnings.map((w) => (
            <p key={w} className="text-sm text-amber-300">{w}</p>
          ))}
          <a
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-gradient-to-r from-[#ffd166] to-[#f8a14a] px-4 text-sm font-bold text-[#2a1700] hover:brightness-110"
          >
            {`View on ${marketplace}`}
          </a>
          <CardmarketLink productId={deal.cardmarketProductId} productName={deal.productName} />
        </div>
      </div>
    </section>
  );
}
