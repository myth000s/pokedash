import { SEALED_TYPES, type SealedType } from '@/deals/sections';

export type DashboardTab = 'deals' | 'singles' | 'sealed';
export interface DashboardParams { tab: DashboardTab; allSingles: boolean; sealedType: SealedType | null }

export function parseDashboardParams(sp: Record<string, string | string[] | undefined>): DashboardParams {
  const tab: DashboardTab = sp.tab === 'singles' || sp.tab === 'sealed' ? sp.tab : 'deals';
  const sealedType = SEALED_TYPES.find((t) => t.key === sp.type)?.key ?? null;
  return { tab, allSingles: sp.all === '1', sealedType };
}
