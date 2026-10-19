import { Suspense } from 'react';
import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { getDealFeed, getLastCheckedAt } from '@/deals/feed';
import { DealFeed } from '@/components/DealFeed';

// Reads the database on every request: connection() opts out of build-time prerendering.
async function Feed() {
  await connection();
  const now = new Date();
  const db = getDb();
  const [deals, lastCheckedAt] = await Promise.all([getDealFeed(db, { now }), getLastCheckedAt(db)]);
  return <DealFeed deals={deals} now={now} lastCheckedAt={lastCheckedAt} />;
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">pokedash</h1>
        <p className="text-sm text-foreground/70">30th Celebration deals</p>
      </header>
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading deals…</p>}>
        <Feed />
      </Suspense>
    </main>
  );
}
