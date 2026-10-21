import { dashboardHref, parseDashboardParams, type DashboardParams, type DashboardTab } from '@/lib/params';
import { formatCount } from '@/lib/format';

const TABS: { key: DashboardTab; label: string }[] = [
  { key: 'deals', label: 'Deals' },
  { key: 'singles', label: 'Singles' },
  { key: 'sealed', label: 'Sealed' },
];

export function SectionTabs({ active, counts, params = parseDashboardParams({}) }: {
  active: DashboardTab; counts: Record<DashboardTab, number>; params?: DashboardParams;
}) {
  return (
    <nav aria-label="Sections" className="mb-3 flex gap-1.5 overflow-x-auto p-1 border-b border-white/[0.13]">
      {TABS.map(({ key, label }) => (
        <a
          key={key}
          href={dashboardHref(params, { tab: key, allSingles: false, sealedType: null })}
          aria-current={active === key ? 'page' : undefined}
          className={`flex min-h-11 items-center whitespace-nowrap rounded-t-[10px] px-3.5 text-[13px] ${
            active === key ? 'bg-gold font-bold text-[#0a0c1e]' : 'text-mute hover:text-white'
          }`}
        >
          {label}
          <span className="ml-1 text-[11px] opacity-75">{formatCount(counts[key])}</span>
        </a>
      ))}
      <span aria-disabled="true" className="flex min-h-11 items-center whitespace-nowrap px-3.5 text-[13px] text-mute opacity-45">Slabs · soon</span>
    </nav>
  );
}
