import { Suspense } from 'react';
import { connection } from 'next/server';
import { requireAal2 } from '@/auth/session';
import { getDb } from '@/db/client';
import { getDealFeed } from '@/deals/feed';
import { getFeedStats } from '@/deals/stats';
import { getSectionCounts, getSectionRows } from '@/deals/sections';
import { filterDeals } from '@/deals/filters';
import { clearFiltersHref, hasActiveFilters, parseDashboardParams } from '@/lib/params';
import { TRACKED_SETS } from '@/config/sets';
import { DealFeed } from '@/components/DealFeed';
import { TopBar } from '@/components/TopBar';
import { StatsRow } from '@/components/StatsRow';
import { SectionTabs } from '@/components/SectionTabs';
import { FilterBar } from '@/components/FilterBar';
import { SectionTable } from '@/components/SectionTable';
import { FeedSkeleton } from '@/components/FeedSkeleton';

// Reads the database on every request: connection() opts out of build-time prerendering.
// Only AAL2 sessions get past requireAal2(); everyone else is redirected before any database read.
async function Feed({ searchParams }: { searchParams: PageProps<'/'>['searchParams'] }) {
  await connection();
  await requireAal2();
  const params = parseDashboardParams(await searchParams);
  const { tab, allSingles, sealedType } = params;
  const now = new Date();
  const db = getDb();
  const set = TRACKED_SETS[0];
  const [allDeals, stats, counts] = await Promise.all([
    getDealFeed(db, { now }), getFeedStats(db, set.key), getSectionCounts(db, set.key, now),
  ]);
  const deals = filterDeals(allDeals, params);
  const filterActive = hasActiveFilters(params);
  const clearHref = clearFiltersHref(params);
  const rows = tab === 'deals'
    ? []
    : await getSectionRows(db, { section: tab, setKey: set.key, now, allSingles, sealedType: sealedType ?? undefined, query: params.q, language: params.lang ?? undefined });
  return (
    <>
      <TopBar setName={set.name} lastCheckedAt={stats.lastCheckedAt} now={now} />
      <StatsRow dealCount={allDeals.length} bestSavingCents={allDeals[0]?.score.discountCents ?? null} stats={stats} now={now} />
      <SectionTabs active={tab} counts={{ deals: allDeals.length, ...counts }} params={params} />
      <FilterBar params={params} />
      {tab === 'deals'
        ? <DealFeed deals={deals} now={now} lastCheckedAt={stats.lastCheckedAt} filter={{ active: filterActive, totalBefore: allDeals.length, clearHref }} />
        : <SectionTable section={tab} rows={rows} allSingles={allSingles} sealedType={sealedType} params={params} filter={{ active: filterActive, totalBefore: counts[tab], clearHref }} />}
    </>
  );
}

export default function Home({ searchParams }: PageProps<'/'>) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <Suspense fallback={<FeedSkeleton />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
