import type { DealView } from '@/deals/feed';
import type { Condition, Marketplace } from '@/domain/types';
import { formatAge, formatEuro, formatPct } from '@/lib/format';

const CONDITION_LABELS: Record<Condition, string> = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  slightly_played: 'Slightly Played',
  moderately_played: 'Moderately Played',
  played: 'Played',
  poor: 'Poor',
};

const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  cardtrader: 'CardTrader',
  ebay: 'eBay',
};

function Badge({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const tones = {
    neutral: 'bg-zinc-100 text-zinc-700',
    good: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function DealCard({ deal, now }: { deal: DealView; now: Date }) {
  const { benchmark, score } = deal;
  const warnings = score.warnings.filter((w) => w !== 'Shipping not included');
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold leading-snug text-zinc-900">{deal.productName}</h2>
      <div className="flex flex-wrap gap-1.5">
        <Badge>{deal.kind === 'sealed' ? 'Sealed' : 'Single'}</Badge>
        <Badge>{MARKETPLACE_LABELS[deal.marketplace]}</Badge>
        {deal.language && <Badge>{deal.language.toUpperCase()}</Badge>}
        {deal.condition && <Badge>{CONDITION_LABELS[deal.condition]}</Badge>}
        {deal.isReverseHolo && <Badge>Reverse Holo</Badge>}
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900">{formatEuro(deal.priceCents)}</p>
        <p className="text-sm text-zinc-600">
          {deal.shippingCents === null ? 'Shipping not included' : `+ ${formatEuro(deal.shippingCents)} shipping`}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        {benchmark.valueCents !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-zinc-700">{`Market value ${formatEuro(benchmark.valueCents)}`}</p>
            <Badge tone={benchmark.confidence === 'high' ? 'good' : 'warn'}>
              {benchmark.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
            </Badge>
          </div>
        )}
        {score.discountCents !== null && score.discountPct !== null && (
          <p className="text-sm font-semibold text-emerald-700">
            {`${formatEuro(score.discountCents)} below market (${formatPct(score.discountPct)})`}
          </p>
        )}
        <p className="text-xs text-zinc-500">
          {`Market value updated ${formatAge(benchmark.capturedAt, now)} · Listing seen ${formatAge(deal.lastSeenAt, now)}`}
        </p>
      </div>
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {warnings.map((w) => (
            <li key={w} className="text-sm text-amber-700">{w}</li>
          ))}
        </ul>
      )}
      <a
        href={deal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
      >
        View listing
      </a>
      <p className="text-xs text-zinc-400">Based on Cardmarket trend (sales)</p>
    </li>
  );
}

export function DealFeed({ deals, now, lastCheckedAt }: { deals: DealView[]; now: Date; lastCheckedAt: Date | null }) {
  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
        <p className="text-base font-medium text-zinc-900">No deals right now.</p>
        <p className="mt-1 text-sm text-zinc-600">
          {lastCheckedAt ? `Last checked ${formatAge(lastCheckedAt, now)}` : 'No listings have been checked yet.'}
        </p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {deals.map((deal) => (
        <DealCard key={deal.listingId} deal={deal} now={now} />
      ))}
    </ul>
  );
}
