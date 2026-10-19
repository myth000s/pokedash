import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEcbUsdRate } from './ecb';

describe('parseEcbUsdRate', () => {
  it('reads the USD rate and its date', () => {
    expect(parseEcbUsdRate(readFileSync('test/fixtures/ecb-daily.xml', 'utf8'))).toEqual({ rateDate: '2026-10-19', usdPerEur: 1.1225 });
  });
  it('rejects a file without a USD rate', () => {
    expect(() => parseEcbUsdRate("<Cube time='2026-10-19'><Cube currency='JPY' rate='168.45'/></Cube>")).toThrow();
  });
});
