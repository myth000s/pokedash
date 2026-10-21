import type { ReactNode } from 'react';
import { SEALED_TYPES, type SealedType, type SectionRow } from '@/deals/sections';
import { formatEuro, formatPct, formatUsd } from '@/lib/format';
import { splitProductName } from '@/lib/names';
import { dashboardHref, parseDashboardParams, type DashboardParams } from '@/lib/params';
import { CardImage } from './CardImage';
import { NothingMatches, ResultLine, type ResultFilter } from './FilterResult';

const GRID = 'md:grid-cols-[44px_minmax(0,1fr)_100px_120px_150px_90px_60px]';

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`flex min-h-11 items-center rounded-full border px-3 text-xs ${
        active ? 'border-white bg-white font-semibold text-[#0a0c1e]' : 'border-white/[0.13] text-mute hover:text-white'
      }`}
    >
      {children}
    </a>
  );
}

function Toolbar({ section, allSingles, sealedType, params }: {
  section: 'singles' | 'sealed'; allSingles: boolean; sealedType: SealedType | null; params: DashboardParams;
}) {
  const href = (o: Partial<DashboardParams>) => dashboardHref(params, { tab: section, allSingles: false, sealedType: null, ...o });
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs text-mute">
      {section === 'singles' ? (
        <>
          <Chip href={href({})} active={!allSingles}>Worth €5+</Chip>
          <Chip href={href({ allSingles: true })} active={allSingles}>All singles</Chip>
          <span className="ml-auto">Sorted by: market value</span>
        </>
      ) : (
        <>
          <Chip href={href({})} active={sealedType === null}>All</Chip>
          {SEALED_TYPES.filter((t) => t.key !== 'other').map((t) => (
            <Chip key={t.key} href={href({ sealedType: t.key })} active={sealedType === t.key}>{t.label}</Chip>
          ))}
        </>
      )}
    </div>
  );
}

// On narrow screens each cell shows its own label; from md up the header row takes over.
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 md:block">
      <span className="text-[11px] uppercase tracking-[0.06em] text-mute md:sr-only">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Difference({ discountPct }: { discountPct: number | null }) {
  if (discountPct === null) return <span className="text-mute">–</span>;
  const good = discountPct >= 0;
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 font-display text-xs ${
        good ? 'border-mint/45 bg-mint/15 text-[#8ff0cf]' : 'border-[#ff8fa3]/35 bg-[#ff8fa3]/10 text-[#ff8fa3]'
      }`}
    >
      {good ? `−${formatPct(discountPct)}` : `+${formatPct(-discountPct)}`}
    </span>
  );
}

function Row({ row, section, langLabel }: { row: SectionRow; section: 'singles' | 'sealed'; langLabel: string }) {
  const { title, detail } = splitProductName(row.productName);
  const sub = section === 'singles' ? detail : SEALED_TYPES.find((t) => t.key === row.sealedType)?.label ?? null;
  const { offer } = row;
  const classes = `grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-[10px] border bg-white/[0.06] px-2.5 py-2 text-[13px] md:gap-3 ${GRID} ${
    offer?.score.isDeal ? 'border-mint/60 shadow-[0_0_0_1px_rgba(6,214,160,0.6),0_0_18px_-6px_rgba(6,214,160,0.7)]' : 'border-white/[0.13]'
  }`;
  const cells = (
    <>
      <CardImage key={row.imageUrl ?? 'none'} src={row.imageUrl} alt={row.productName} className="!text-lg" />
      <div className="min-w-0">
        <b className="line-clamp-2 font-semibold">{title}</b>
        {sub && <span className="line-clamp-1 text-[11.5px] text-mute">{sub}</span>}
      </div>
      <div id={`section-row-${row.productId}`} className="col-span-2 grid grid-cols-1 gap-1.5 md:contents">
        <Cell label="Market value">
          <span className="font-display">{row.benchmark.valueCents !== null ? formatEuro(row.benchmark.valueCents) : '–'}</span>
        </Cell>
        <Cell label="US English-only">
          {row.us ? (
            <span className="text-xs text-mute">
              <b className="font-display text-[13px] font-normal text-ink">{formatEuro(row.us.eurCents)}</b>{' '}
              <span>{`(${formatUsd(row.us.usdCents)})`}</span>
            </span>
          ) : <span className="text-mute">–</span>}
        </Cell>
        <Cell label={`Cheapest ${langLabel}`}>
          {offer ? (
            <span>
              <span className="font-display">{formatEuro(offer.priceCents)}</span>{' '}
              <small className="text-mute">{[offer.language.toUpperCase(), offer.sellerCountry].filter(Boolean).join(' · ')}</small>
            </span>
          ) : <span className="text-xs text-mute">{`no ${langLabel} offer yet`}</span>}
        </Cell>
        <Cell label="Difference"><Difference discountPct={offer ? offer.score.discountPct : null} /></Cell>
        <Cell label="Offers"><span>{row.offerCount}</span></Cell>
      </div>
    </>
  );
  return (
    <li>
      {offer ? (
    <a href={offer.url} target="_blank" rel="noopener noreferrer" aria-label={`View ${row.productName} on CardTrader`} aria-describedby={`section-row-${row.productId}`} className={`${classes} hover:border-white/30`}>{cells}</a>
      ) : (
    <div className={classes}>{cells}</div>
      )}
    </li>
  );
}

export function SectionTable({ section, rows, allSingles, sealedType, params = parseDashboardParams({}), filter }: {
  section: 'singles' | 'sealed'; rows: SectionRow[]; allSingles: boolean; sealedType: SealedType | null;
  params?: DashboardParams; filter?: ResultFilter;
}) {
  const langLabel = params.lang === 'de' ? 'DE' : params.lang === 'en' ? 'EN' : 'EN/DE';
  const heads = section === 'singles'
    ? ['Card', 'Market value', 'US English-only', `Cheapest ${langLabel} (Near Mint)`, 'Difference', 'Offers']
    : ['Product', 'Market value', 'US English-only', `Cheapest ${langLabel}`, 'Difference', 'Offers'];
  return (
    <section>
      <Toolbar section={section} allSingles={allSingles} sealedType={sealedType} params={params} />
      {filter?.active && rows.length > 0 && <ResultLine count={rows.length} noun="product" />}
      {rows.length === 0 && filter?.active && filter.totalBefore > 0 ? (
        <NothingMatches clearHref={filter.clearHref} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/25 bg-white/[0.06] p-8 text-center text-sm text-mute">
          No products in this section yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div aria-hidden="true" className={`hidden items-end gap-3 px-2.5 pb-0.5 text-[11px] uppercase tracking-[0.06em] text-mute md:grid ${GRID}`}>
            <span />
            {heads.map((h) => <span key={h}>{h}</span>)}
          </div>
          {/* Safari drops list semantics under list-style: none; role="list" restores them (false positive). */}
          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
          <ul role="list" className="m-0 flex list-none flex-col gap-1.5 p-0">
            {rows.map((r) => <Row key={r.productId} row={r} section={section} langLabel={langLabel} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
