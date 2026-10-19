import type { DealView } from '@/deals/feed';
import { DEFAULT_DEAL_SETTINGS } from '@/config/settings';
import { formatAge, formatPct } from '@/lib/format';
import { DealTile } from './DealTile';
import { HeroDeal } from './HeroDeal';

export function DealFeed({ deals, now, lastCheckedAt }: { deals: DealView[]; now: Date; lastCheckedAt: Date | null }) {
  if (deals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/25 bg-white/[0.06] p-8 text-center">
        <p className="font-display text-lg">No deals right now.</p>
        <p className="mt-1 text-sm text-mute">
          {lastCheckedAt ? `Last checked ${formatAge(lastCheckedAt, now)}` : 'No listings have been checked yet.'}
        </p>
        <p className="mt-1 text-sm text-mute">
          {`A deal needs at least ${formatPct(DEFAULT_DEAL_SETTINGS.minDiscountPct)} below market value.`}
        </p>
      </div>
    );
  }
  const [best, ...rest] = deals;
  return (
    <div className="flex flex-col gap-6">
      <HeroDeal deal={best} now={now} />
      {rest.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-base">All deals</h2>
            <p className="text-xs text-mute">Sorted by: biggest € saving</p>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rest.map((deal) => (
              <DealTile key={deal.listingId} deal={deal} now={now} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
