import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ingestFxRate } from './fx';
import { fxRates } from '@/db/schema';
import { createTestDb } from '../../test/helpers/db';

describe('ingestFxRate', () => {
  it('stores the daily rate once', async () => {
    const db = await createTestDb();
    const deps = { fetchText: async () => readFileSync('test/fixtures/ecb-daily.xml', 'utf8') };
    expect(await ingestFxRate(db, deps)).toEqual({ rateDate: '2026-10-19', inserted: true });
    expect(await ingestFxRate(db, deps)).toEqual({ rateDate: '2026-10-19', inserted: false });
    expect(await db.select().from(fxRates)).toEqual([{ rateDate: '2026-10-19', usdPerEur: 1.1225 }]);
  });
});
