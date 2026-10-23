import { Suspense } from 'react';
import { connection } from 'next/server';
import { requireAal2 } from '@/auth/session';
import { getDb } from '@/db/client';
import { getDealFeed } from '@/deals/feed';
import { getFeedStats } from '@/deals/stats';
import { getAvailableRarities, getSectionCounts, getSectionRows } from '@/deals/sections';
import { filterDeals } from '@/deals/filters';
import { allowedEdition, clearFiltersHref, effectiveSet, hasActiveFilters, parseDashboardParams, showsVintageFilters } from '@/lib/params';
import { TRACKED_SETS } from '@/config/sets';
import { DealFeed } from '@/components/DealFeed';
import { TopBar } from '@/components/TopBar';
import { StatsRow } from '@/components/StatsRow';
import { SectionTabs } from '@/components/SectionTabs';
import { EditionTabs } from '@/components/EditionTabs';
import { FilterBar } from '@/components/FilterBar';
import { SectionTable } from '@/components/SectionTable';
import { FeedSkeleton } from '@/components/FeedSkeleton';

// Reads the database on every request: connection() opts out of build-time prerendering.
// Only AAL2 sessions get past requireAal2(); everyone else is redirected before any database read.
async function Feed({ searchParams }: { searchParams: PageProps<'/'>['searchParams'] }) {
  await connection();
  await requireAal2();
  const parsed = parseDashboardParams(await searchParams);
  const { tab, allSingles, sealedType } = parsed;
  const now = new Date();
  const db = getDb();
  // Deals with no set span every tracked set; Singles and Sealed need one set, so they fall back to the first.
  const set = effectiveSet(parsed);
  const sectionSet = set ?? TRACKED_SETS[0];
  // A set switch must not carry an edition the set lacks.
  const edition = allowedEdition(parsed);
  const vintageUi = showsVintageFilters(parsed);
  const sectionEdition = sectionSet.era === 'vintage' ? edition ?? 'unlimited' : undefined;
  const sectionCondition = sectionSet.era === 'vintage' ? parsed.condition ?? 'nm' : undefined;
  const [allDeals, stats, counts, rarities] = await Promise.all([
    getDealFeed(db, { now }),
    getFeedStats(db, set?.key ?? null),
    getSectionCounts(db, sectionSet.key, now, { edition: sectionEdition, conditionGroup: sectionCondition }),
    tab === 'sealed' ? Promise.resolve<string[]>([]) : getAvailableRarities(db, tab === 'deals' ? set?.key ?? null : sectionSet.key),
  ]);
  // ... nor rarities the set lacks (Sealed has no rarity control, so its rarities pass through untouched).
  const params = {
    ...parsed, edition,
    rarities: tab === 'sealed' ? parsed.rarities : parsed.rarities.filter((r) => rarities.includes(r)),
  };
  const setDeals = set ? allDeals.filter((d) => d.setKey === set.key) : allDeals;
  const deals = filterDeals(allDeals, {
    ...params, edition: vintageUi ? edition : null, condition: vintageUi ? params.condition : null,
  });
  const filterActive = hasActiveFilters(params);
  const clearHref = clearFiltersHref(params);
  const rows = tab === 'deals'
    ? []
    : await getSectionRows(db, {
      section: tab, setKey: sectionSet.key, now, allSingles, sealedType: sealedType ?? undefined,
      query: params.q, language: params.lang ?? undefined,
      edition: sectionEdition, conditionGroup: sectionCondition,
      rarities: tab === 'singles' ? params.rarities : undefined, sort: params.sort ?? undefined,
    });
  return (
    <>
      <TopBar setName={set?.name ?? null} lastCheckedAt={stats.lastCheckedAt} now={now} />
      <StatsRow dealCount={setDeals.length} bestSavingCents={setDeals[0]?.score.discountCents ?? null} stats={stats} now={now} />
      <SectionTabs active={tab} counts={{ deals: setDeals.length, ...counts }} params={params} />
      {set?.era === 'vintage' && <EditionTabs params={params} set={set} />}
      <FilterBar params={params} rarities={rarities} />
      {tab === 'deals'
        ? <DealFeed sort={params.sort} deals={deals} now={now} lastCheckedAt={stats.lastCheckedAt} filter={{ active: filterActive, totalBefore: setDeals.length, clearHref }} />
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
