import type { FeedStats } from '@/deals/stats';
import { formatCount, formatEuro, formatFreshness } from '@/lib/format';

function Tile({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.13] bg-white/[0.06] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.07em] text-mute">{label}</p>
      <p className={`mt-0.5 font-display text-xl ${gold ? 'text-gold' : 'text-white'}`}>{value}</p>
    </div>
  );
}

export function StatsRow({ dealCount, bestSavingCents, stats, now }: {
  dealCount: number;
  bestSavingCents: number | null;
  stats: FeedStats;
  now: Date;
}) {
  return (
    <div className="my-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      <Tile label="Deals now" value={formatCount(dealCount)} />
      <Tile label="Best saving" value={bestSavingCents === null ? '–' : formatEuro(bestSavingCents)} gold />
      <Tile label="Listings checked" value={formatCount(stats.listingsChecked)} />
      <Tile label="Products tracked" value={formatCount(stats.productsTracked)} />
      <Tile label="Cardmarket notes" value={formatFreshness(stats.marketValuesAt, now)} />
    </div>
  );
}
