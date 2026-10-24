import { SEALED_TYPES, type SealedType, type SortKey } from '@/deals/sections';
import type { ConditionGroup } from '@/deals/reference';
import { findSet, TRACKED_SETS } from '@/config/sets';
import type { Edition, ProductKind } from '@/domain/types';

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
  /** A known set key. Null means all sets on Deals and the first tracked set on Singles/Sealed. */
  set: string | null;
  edition: Edition | null;
  condition: ConditionGroup | null;
  rarities: string[];
  sort: SortKey | null;
}

const MAX_Q = 100;
const MAX_EUROS = 100000;
const MAX_RARITY = 60;
const MAX_RARITIES = 20;
const MAX_RARITY_INPUT = 100;
const EDITIONS: Edition[] = ['first_edition', 'shadowless', 'unlimited'];
const CONDITIONS: ConditionGroup[] = ['nm', 'sp', 'mp'];
const SORTS: SortKey[] = ['saving', 'cheapest', 'expensive'];

function cleanText(v: string, max: number): string {
  return Array.from(v.toWellFormed().replace(/\p{Cc}/gu, '').trim()).slice(0, max).join('').trim();
}

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function parseDashboardParams(sp: Record<string, string | string[] | undefined>): DashboardParams {
  const tab: DashboardTab = sp.tab === 'singles' || sp.tab === 'sealed' ? sp.tab : 'deals';
  const sealedType = SEALED_TYPES.find((t) => t.key === sp.type)?.key ?? null;
  const q = cleanText(one(sp.q) ?? '', MAX_Q);
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
  const setRaw = one(sp.set);
  const set = setRaw !== undefined && findSet(setRaw) ? setRaw : null;
  const editionRaw = one(sp.edition);
  const edition = EDITIONS.find((e) => e === editionRaw) ?? null;
  const condition = CONDITIONS.find((c) => c === one(sp.condition)) ?? null;
  const sort = SORTS.find((k) => k === one(sp.sort)) ?? null;
  const rarityRaw = typeof sp.rarity === 'string' ? [sp.rarity] : sp.rarity ?? [];
  const rarities = [...new Set(rarityRaw.slice(0, MAX_RARITY_INPUT).map((r) => cleanText(r, MAX_RARITY)).filter((r) => r !== ''))].slice(0, MAX_RARITIES);
  const deals = tab === 'deals';
  return {
    tab, allSingles: sp.all === '1', sealedType, q, lang,
    kind: deals ? kind : null, minPct: deals ? minPct : null, maxPriceCents: deals ? maxPriceCents : null,
    set, edition, condition, rarities, sort,
  };
}

export function hasActiveFilters(p: DashboardParams): boolean {
  return p.q !== '' || p.lang !== null || p.rarities.length > 0 || (p.condition !== null && p.tab !== 'sealed' && showsVintageFilters(p)) || p.kind !== null || p.minPct !== null || p.maxPriceCents !== null;
}

/** The set a tab shows: Deals with no set spans all sets (null); Singles and Sealed fall back to the first tracked set. */
export function effectiveSet(p: Pick<DashboardParams, 'tab' | 'set'>) {
  if (p.set !== null) return findSet(p.set) ?? null;
  return p.tab === 'deals' ? null : TRACKED_SETS[0];
}

/** Edition and condition only mean something for vintage sets, or for Deals across all sets. */
export function showsVintageFilters(p: Pick<DashboardParams, 'tab' | 'set'>): boolean {
  const set = effectiveSet(p);
  return set === null || set.era === 'vintage';
}

/**
 * The edition the effective set offers: 1st Edition and Shadowless only where they exist, none for a modern set.
 * Deals across all sets show no edition control, so they keep none either.
 */
export function allowedEdition(p: Pick<DashboardParams, 'tab' | 'set' | 'edition'>): Edition | null {
  const set = effectiveSet(p);
  if (set === null) return null;
  if (set.era !== 'vintage') return null;
  if (p.edition === 'first_edition') return set.hasFirstEdition ? p.edition : null;
  if (p.edition === 'shadowless') return set.shadowlessExpansionId ? p.edition : null;
  return p.edition;
}

export function dashboardHref(p: DashboardParams, overrides: Partial<DashboardParams> = {}): string {
  const r = { ...p, ...overrides };
  const parts = [`tab=${r.tab}`];
  if (r.q) parts.push(`q=${encodeURIComponent(r.q)}`);
  if (r.lang) parts.push(`lang=${r.lang}`);
  if (r.set) parts.push(`set=${r.set}`);
  if (r.tab === 'deals') {
    if (r.kind) parts.push(`kind=${r.kind}`);
    if (r.minPct) parts.push(`min=${r.minPct}`);
    if (r.maxPriceCents) parts.push(`max=${r.maxPriceCents / 100}`);
  }
  if (showsVintageFilters(r)) {
    const edition = allowedEdition(r);
    if (edition) parts.push(`edition=${edition}`);
    if (r.condition) parts.push(`condition=${r.condition}`);
  }
  for (const rarity of r.rarities) parts.push(`rarity=${encodeURIComponent(rarity)}`);
  if (r.sort) parts.push(`sort=${r.sort}`);
  if (r.tab === 'singles' && r.allSingles) parts.push('all=1');
  if (r.tab === 'sealed' && r.sealedType) parts.push(`type=${r.sealedType}`);
  return `?${parts.join('&')}`;
}

export function clearFiltersHref(p: DashboardParams): string {
  return dashboardHref(p, { q: '', lang: null, kind: null, minPct: null, maxPriceCents: null, rarities: [], condition: null, edition: null });
}
