import type { DealView } from '@/deals/feed';
import type { SortKey } from '@/deals/sections';
import { DEFAULT_DEAL_SETTINGS } from '@/config/settings';
import { formatAge, formatCount, formatPct } from '@/lib/format';
import { DealTile } from './DealTile';
import { HeroDeal } from './HeroDeal';
import { NothingMatches, ResultLine, type ResultFilter } from './FilterResult';

const SORT_LABEL: Record<SortKey, string> = {
  saving: 'biggest saving (€)', cheapest: 'cheapest first', expensive: 'most expensive first',
};

/** The feed shows at most this many deals, the top ones by the chosen sort. */
export const MAX_SHOWN_DEALS = 150;

export function DealFeed({ deals, now, lastCheckedAt, filter, sort = null }: {
  deals: DealView[]; now: Date; lastCheckedAt: Date | null; filter?: ResultFilter; sort?: SortKey | null;
}) {
  if (deals.length === 0 && filter?.active && filter.totalBefore > 0) {
    return <NothingMatches clearHref={filter.clearHref} />;
  }
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
  // The hero is the biggest saving, so it only makes sense with the default order.
  const showHero = sort === null || sort === 'saving';
  const shown = deals.slice(0, MAX_SHOWN_DEALS);
  const best = showHero ? shown[0] : null;
  const rest = showHero ? shown.slice(1) : shown;
  return (
    <div className="flex flex-col gap-6">
      {filter?.active && <ResultLine count={deals.length} noun="deal" />}
      {deals.length > MAX_SHOWN_DEALS && (
        <p className="text-xs text-mute">
          {`Showing the top ${MAX_SHOWN_DEALS} of ${formatCount(deals.length)} deals. Use the filters to narrow them down.`}
        </p>
      )}
      {best && <HeroDeal deal={best} now={now} />}
      {rest.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-base">All deals</h2>
            <p className="text-xs text-mute">{`Sorted by: ${SORT_LABEL[sort ?? 'saving']}`}</p>
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
