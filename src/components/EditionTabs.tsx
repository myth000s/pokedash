import type { TrackedSet } from '@/config/sets';
import type { Edition } from '@/domain/types';
import { dashboardHref, type DashboardParams } from '@/lib/params';

// Under SectionTabs for vintage sets. Singles and sealed default to Unlimited; on Deals no edition means all of them.
export function EditionTabs({ params, set }: { params: DashboardParams; set: TrackedSet }) {
  const active: Edition | null = params.edition ?? (params.tab === 'deals' ? null : 'unlimited');
  const tabs: { edition: Edition; label: string }[] = [
    ...(set.hasFirstEdition ? [{ edition: 'first_edition' as const, label: '1st Edition' }] : []),
    ...(set.shadowlessExpansionId ? [{ edition: 'shadowless' as const, label: 'Shadowless' }] : []),
    { edition: 'unlimited', label: 'Unlimited' },
  ];
  return (
    <nav aria-label="Edition" className="mb-3 flex flex-wrap gap-2">
      {tabs.map(({ edition, label }) => (
        <a
          key={edition}
          href={dashboardHref(params, { edition })}
          aria-current={active === edition ? 'page' : undefined}
          className={`flex min-h-11 items-center rounded-full border px-3.5 text-xs ${
            active === edition ? 'border-white bg-white font-semibold text-[#0a0c1e]' : 'border-white/[0.13] text-mute hover:text-white'
          }`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
