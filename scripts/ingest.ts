import { z } from 'zod';
import { TRACKED_SETS } from '../src/config/sets';
import { closeDb, createDb } from '../src/db/client';
import { describeError } from '../src/lib/errors';
import { fetchJson } from '../src/lib/http';
import { runIngestion } from '../src/ingest/run';
import { createCardTraderClient } from '../src/providers/cardtrader/client';
import { createCardTraderProvider } from '../src/providers/cardtrader/provider';
import type { ListingProvider } from '../src/providers/types';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and run again.');
    process.exitCode = 1;
    return;
  }
  const providers: ListingProvider[] = [];
  const token = process.env.CARDTRADER_TOKEN;
  if (token) providers.push(createCardTraderProvider(createCardTraderClient({ token })));
  else console.log('CARDTRADER_TOKEN not set: skipping CardTrader');

  const db = createDb(url);
  try {
    const reports = await runIngestion(
      db,
      { fetchJson: (u) => fetchJson(u, { schema: z.unknown() }), providers },
      TRACKED_SETS,
      new Date(),
    );
    for (const r of reports) {
      console.log(`Set ${r.set}`);
      if ('error' in r.cardmarket) {
        console.log(`  Cardmarket: ERROR ${r.cardmarket.error}`);
        process.exitCode = 1;
      } else {
        console.log(`  Cardmarket: ${r.cardmarket.products} products, ${r.cardmarket.snapshots} new snapshots`);
      }
      for (const p of r.providers) {
        if (p.error !== undefined) {
          console.log(`  ${p.marketplace}: ERROR ${p.error}`);
          process.exitCode = 1;
        } else if (p.result) {
          const x = p.result;
          console.log(`  ${p.marketplace}: ${x.upserted} upserted, ${x.skipped} skipped, ${x.markedUnavailable} marked unavailable`);
          for (const [reason, n] of Object.entries(x.skipReasons)) console.log(`    skipped ${reason}: ${n}`);
        }
      }
    }
  } finally {
    await closeDb(db);
  }
}

main().catch((err) => {
  console.error('Ingestion failed:', describeError(err));
  process.exitCode = 1;
});
