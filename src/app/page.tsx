import { Suspense } from 'react';
import { connection } from 'next/server';
import { requireAal2 } from '@/auth/session';
import { getDb } from '@/db/client';
import { getDealFeed } from '@/deals/feed';
import { getFeedStats } from '@/deals/stats';
import { getSectionCounts, getSectionRows } from '@/deals/sections';
import { parseDashboardParams } from '@/lib/params';
import { TRACKED_SETS } from '@/config/sets';
import { DealFeed } from '@/components/DealFeed';
import { TopBar } from '@/components/TopBar';
import { StatsRow } from '@/components/StatsRow';
import { SectionTabs } from '@/components/SectionTabs';
import { SectionTable } from '@/components/SectionTable';
import { FeedSkeleton } from '@/components/FeedSkeleton';

// Reads the database on every request: connection() opts out of build-time prerendering.
// Only AAL2 sessions get past requireAal2(); everyone else is redirected before any database read.
async function Feed({ searchParams }: { searchParams: PageProps<'/'>['searchParams'] }) {
  await connection();
  await requireAal2();
  const { tab, allSingles, sealedType } = parseDashboardParams(await searchParams);
  const now = new Date();
  const db = getDb();
  const set = TRACKED_SETS[0];
  const [deals, stats, counts] = await Promise.all([
    getDealFeed(db, { now }), getFeedStats(db, set.key), getSectionCounts(db, set.key, now),
  ]);
  const rows = tab === 'deals'
    ? []
    : await getSectionRows(db, { section: tab, setKey: set.key, now, allSingles, sealedType: sealedType ?? undefined });
  return (
    <>
      <TopBar setName={set.name} lastCheckedAt={stats.lastCheckedAt} now={now} />
      <StatsRow dealCount={deals.length} bestSavingCents={deals[0]?.score.discountCents ?? null} stats={stats} now={now} />
      <SectionTabs active={tab} counts={{ deals: deals.length, ...counts }} />
      {tab === 'deals'
        ? <DealFeed deals={deals} now={now} lastCheckedAt={stats.lastCheckedAt} />
        : <SectionTable section={tab} rows={rows} allSingles={allSingles} sealedType={sealedType} />}
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
