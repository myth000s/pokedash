import { Suspense } from 'react';
import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { getDealFeed } from '@/deals/feed';
import { getFeedStats } from '@/deals/stats';
import { TRACKED_SETS } from '@/config/sets';
import { DealFeed } from '@/components/DealFeed';
import { TopBar } from '@/components/TopBar';
import { StatsRow } from '@/components/StatsRow';
import { FeedSkeleton } from '@/components/FeedSkeleton';

// Reads the database on every request: connection() opts out of build-time prerendering.
async function Feed() {
  await connection();
  const now = new Date();
  const db = getDb();
  const set = TRACKED_SETS[0];
  const [deals, stats] = await Promise.all([getDealFeed(db, { now }), getFeedStats(db, set.key)]);
  return (
    <>
      <TopBar setName={set.name} lastCheckedAt={stats.lastCheckedAt} now={now} />
      <StatsRow dealCount={deals.length} bestSavingCents={deals[0]?.score.discountCents ?? null} stats={stats} now={now} />
      <DealFeed deals={deals} now={now} lastCheckedAt={stats.lastCheckedAt} />
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <Suspense fallback={<FeedSkeleton />}>
        <Feed />
      </Suspense>
    </main>
  );
}
