import { SEALED_TYPES, type SealedType } from '@/deals/sections';
import type { ProductKind } from '@/domain/types';

export type DashboardTab = 'deals' | 'singles' | 'sealed';
export interface DashboardParams {
  tab: DashboardTab;
  allSingles: boolean;
  sealedType: SealedType | null;
  q: string;
  lang: 'en' | 'de' | null;
  kind: ProductKind | null;
  minPct: 30 | 40 | 50 | null;
  maxPriceCents: number | null;
}

const MAX_Q = 100;
const MAX_EUROS = 100000;

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function parseDashboardParams(sp: Record<string, string | string[] | undefined>): DashboardParams {
  const tab: DashboardTab = sp.tab === 'singles' || sp.tab === 'sealed' ? sp.tab : 'deals';
  const sealedType = SEALED_TYPES.find((t) => t.key === sp.type)?.key ?? null;
  const q = Array.from((one(sp.q) ?? '').toWellFormed().replace(/\p{Cc}/gu, '').trim()).slice(0, MAX_Q).join('').trim();
  const langRaw = one(sp.lang);
  const lang = langRaw === 'en' || langRaw === 'de' ? langRaw : null;
  const kindRaw = one(sp.kind);
  const kind = kindRaw === 'single' || kindRaw === 'sealed' ? kindRaw : null;
  const minRaw = one(sp.min);
  const minPct = minRaw === '30' || minRaw === '40' || minRaw === '50' ? (Number(minRaw) as 30 | 40 | 50) : null;
  const maxRaw = one(sp.max);
  let maxPriceCents: number | null = null;
  if (maxRaw !== undefined && /^\d+$/.test(maxRaw)) {
    const euros = Number(maxRaw);
    if (euros >= 1 && euros <= MAX_EUROS) maxPriceCents = euros * 100;
  }
  const deals = tab === 'deals';
  return {
    tab, allSingles: sp.all === '1', sealedType, q, lang,
    kind: deals ? kind : null, minPct: deals ? minPct : null, maxPriceCents: deals ? maxPriceCents : null,
  };
}

export function hasActiveFilters(p: DashboardParams): boolean {
  return p.q !== '' || p.lang !== null || p.kind !== null || p.minPct !== null || p.maxPriceCents !== null;
}

export function dashboardHref(p: DashboardParams, overrides: Partial<DashboardParams> = {}): string {
  const r = { ...p, ...overrides };
  const parts = [`tab=${r.tab}`];
  if (r.q) parts.push(`q=${encodeURIComponent(r.q)}`);
  if (r.lang) parts.push(`lang=${r.lang}`);
  if (r.tab === 'deals') {
    if (r.kind) parts.push(`kind=${r.kind}`);
    if (r.minPct) parts.push(`min=${r.minPct}`);
    if (r.maxPriceCents) parts.push(`max=${r.maxPriceCents / 100}`);
  }
  if (r.tab === 'singles' && r.allSingles) parts.push('all=1');
  if (r.tab === 'sealed' && r.sealedType) parts.push(`type=${r.sealedType}`);
  return `?${parts.join('&')}`;
}

export function clearFiltersHref(p: DashboardParams): string {
  return dashboardHref(p, { q: '', lang: null, kind: null, minPct: null, maxPriceCents: null });
}
