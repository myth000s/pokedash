import { z } from 'zod';
import { TRACKED_SETS } from '../src/config/sets';
import { closeDb, createDb } from '../src/db/client';
import { describeError } from '../src/lib/errors';
import { fetchJson, fetchText } from '../src/lib/http';
import { cleanupOldData, databaseSizeBytes } from '../src/ingest/retention';
import { DB_SIZE_ALERT_BYTES } from '../src/config/settings';
import { missingIngestSecrets, parseIngestMode, runIngestion, type IngestMode } from '../src/ingest/run';
import { createCardTraderClient } from '../src/providers/cardtrader/client';
import { createCardTraderProvider } from '../src/providers/cardtrader/provider';
import { createPptClient } from '../src/providers/ppt/client';
import type { ListingProvider } from '../src/providers/types';

async function main() {
  let mode: IngestMode;
  try {
    mode = parseIngestMode(process.argv.slice(2));
  } catch (err) {
    console.error(describeError(err));
    process.exitCode = 1;
    return;
  }
  // A scheduled run fails on a missing secret (names only, never values). The rest of the run
  // still goes ahead, so the cleanup and the size check are not skipped.
  const missing = missingIngestSecrets(mode, process.env);
  for (const name of missing) console.error(`${name} is not set: the --${mode} run needs it (GitHub secret of the same name).`);
  if (missing.length > 0) process.exitCode = 1;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and run again.');
    process.exitCode = 1;
    return;
  }
  const providers: ListingProvider[] = [];
  const token = process.env.CARDTRADER_TOKEN;
  if (token) providers.push(createCardTraderProvider(createCardTraderClient({ token })));
  else if (mode === 'all') console.log('CARDTRADER_TOKEN not set: skipping CardTrader');

  const pptKey = process.env.POKEMONPRICETRACKER_API_KEY;
  const ppt = mode !== 'listings' && pptKey ? createPptClient({ apiKey: pptKey }) : undefined;
  if (mode === 'all' && !ppt) console.log('POKEMONPRICETRACKER_API_KEY not set: skipping US prices');

  const db = createDb(url);
  try {
    const reports = await runIngestion(
      db,
      { fetchJson: (u) => fetchJson(u, { schema: z.unknown() }), providers, fetchText: (u) => fetchText(u, {}), ppt },
      TRACKED_SETS,
      new Date(),
      mode,
    );
    for (const r of reports) {
      console.log(`Set ${r.set}`);
      if (!r.cardmarket) {
        // listings mode: no Cardmarket step
      } else if ('error' in r.cardmarket) {
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
      if (r.fx) {
        if ('error' in r.fx) {
          console.log(`  FX: ERROR ${r.fx.error}`);
          process.exitCode = 1;
        } else {
          console.log(`  FX: ${r.fx.inserted ? 'stored' : 'already stored'} (${r.fx.rateDate})`);
        }
      }
      if (r.usPrices) {
        if (!('fetched' in r.usPrices)) {
          console.log(`  US prices: ERROR ${r.usPrices.error}`);
          process.exitCode = 1;
        } else {
          const u = r.usPrices;
          const stop = u.stopReason === 'error' ? ` — stopped early: ERROR ${u.error}` : u.stoppedEarly ? ' — stopped early (daily credits used up)' : '';
          console.log(`  US prices: ${u.fetched} fetched, ${u.alreadyToday} already today, ${u.noPrice} without price${u.failed > 0 ? `, ${u.failed} failed` : ''}${stop}`);
          if (u.stopReason === 'error') process.exitCode = 1;
        }
      }
    }
    if (mode === 'daily') {
      const c = await cleanupOldData(db, new Date());
      console.log(`Cleanup: ${c.listings} listings, ${c.priceHistory} price history, ${c.usPrices} US prices, ${c.benchmarks} benchmarks deleted`);
      const size = await databaseSizeBytes(db);
      console.log(`Database size: ${(size / 1024 / 1024).toFixed(1)} MB`);
      if (size > DB_SIZE_ALERT_BYTES) {
        console.log('Database size over 400 MB: shorten retention');
        process.exitCode = 1;
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
