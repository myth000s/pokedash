export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

export function parseEcbUsdRate(xml: string): { rateDate: string; usdPerEur: number } {
  const rateDate = /time='(\d{4}-\d{2}-\d{2})'/.exec(xml)?.[1];
  const rate = /currency='USD'\s+rate='([0-9.]+)'/.exec(xml)?.[1];
  if (!rateDate || !rate) throw new Error('ECB file has no USD rate or date');
  const usdPerEur = Number(rate);
  if (!Number.isFinite(usdPerEur) || usdPerEur <= 0) throw new Error('ECB USD rate is not positive');
  return { rateDate, usdPerEur };
}
