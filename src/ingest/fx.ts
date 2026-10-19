import type { Db } from '@/db/client';
import { fxRates } from '@/db/schema';
import { ECB_DAILY_URL, parseEcbUsdRate } from '@/providers/ecb';

export async function ingestFxRate(
  db: Db,
  deps: { fetchText: (url: string) => Promise<string> },
): Promise<{ rateDate: string; inserted: boolean }> {
  const { rateDate, usdPerEur } = parseEcbUsdRate(await deps.fetchText(ECB_DAILY_URL));
  const rows = await db
    .insert(fxRates)
    .values({ rateDate, usdPerEur })
    .onConflictDoNothing({ target: fxRates.rateDate })
    .returning({ rateDate: fxRates.rateDate });
  return { rateDate, inserted: rows.length > 0 };
}
