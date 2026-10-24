import { TRACKED_SETS } from '@/config/sets';
import { clearFiltersHref, hasActiveFilters, showsVintageFilters, type DashboardParams } from '@/lib/params';

const FIELD = 'min-h-11 rounded-[10px] border border-white/[0.13] bg-white/[0.06] px-3 text-[13px] text-ink';
const LABEL = 'text-[11px] uppercase tracking-[0.06em] text-mute';

function Field({ label, id, children, grow = false }: { label: string; id: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${grow ? 'min-w-[200px] flex-1' : ''}`}>
      <label htmlFor={id} className={LABEL}>{label}</label>
      {children}
    </div>
  );
}

// Checkboxes in a fold-out list: no Ctrl-click needed, and still no JavaScript.
// The boxes sit inside the form even while the list is closed, so they are sent either way.
function RarityPicker({ rarities, chosen }: { rarities: string[]; chosen: string[] }) {
  const summary = chosen.length === 0 ? 'Any rarity' : chosen.length === 1 ? chosen[0] : `${chosen.length} rarities`;
  return (
    <div className="relative flex flex-col gap-1">
      <span className={LABEL} aria-hidden="true">Rarity</span>
      <details>
        <summary className={`${FIELD} flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden`}>
          <span className="sr-only">Rarity: </span>
          <span className="max-w-[180px] truncate">{summary}</span>
          <span aria-hidden="true" className="text-mute">▾</span>
        </summary>
        <fieldset className="absolute left-0 z-20 mt-1 max-h-72 min-w-[220px] overflow-y-auto rounded-[10px] border border-white/[0.13] bg-night p-1 shadow-xl">
          <legend className="sr-only">Rarity</legend>
          {rarities.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] text-ink hover:bg-white/[0.06]">
              <input type="checkbox" name="rarity" value={r} defaultChecked={chosen.includes(r)} className="size-4 accent-[var(--color-gold)]" />
              {r}
            </label>
          ))}
        </fieldset>
      </details>
    </div>
  );
}

// A plain GET form to the same page: works without JavaScript, and every filter lives in the URL.
export function FilterBar({ params, rarities = [] }: { params: DashboardParams; rarities?: string[] }) {
  const deals = params.tab === 'deals';
  const vintage = showsVintageFilters(params);
  const modernSets = TRACKED_SETS.filter((s) => s.era === 'modern');
  const wotcSets = TRACKED_SETS.filter((s) => s.era === 'vintage');
  return (
    <form method="get" role="search" aria-label="Filters" className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.13] bg-white/[0.06] p-3">
      <input type="hidden" name="tab" value={params.tab} />
      {params.tab === 'singles' && params.allSingles && <input type="hidden" name="all" value="1" />}
      {params.tab === 'sealed' && params.sealedType && <input type="hidden" name="type" value={params.sealedType} />}
      {/* The edition is chosen with the tabs under the sections, so the form carries it along. */}
      {vintage && params.edition && <input type="hidden" name="edition" value={params.edition} />}
      <Field label="Search" id="f-q" grow>
        <input id="f-q" type="search" name="q" defaultValue={params.q} placeholder="Search by name…" maxLength={100} className={FIELD} />
      </Field>
      <Field label="Set" id="f-set">
        <select id="f-set" name="set" defaultValue={params.set ?? (deals ? '' : TRACKED_SETS[0].key)} className={FIELD}>
          {deals && <option value="">All sets</option>}
          <optgroup label="Modern">
            {modernSets.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </optgroup>
          <optgroup label="WOTC">
            {wotcSets.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </optgroup>
        </select>
      </Field>
      <Field label="Sort by" id="f-sort">
        <select id="f-sort" name="sort" defaultValue={params.sort ?? (deals ? 'saving' : '')} className={FIELD}>
          {!deals && <option value="">Market value</option>}
          {/* Deals sort by the € saving, Singles and Sealed by the % difference. */}
          <option value="saving">{deals ? 'Biggest saving (€)' : 'Biggest saving (%)'}</option>
          <option value="cheapest">Cheapest first</option>
          <option value="expensive">Most expensive first</option>
        </select>
      </Field>
      {params.tab !== 'sealed' && rarities.length > 0 && <RarityPicker rarities={rarities} chosen={params.rarities} />}
      {vintage && params.tab !== 'sealed' && (
        <Field label="Condition" id="f-condition">
          <select id="f-condition" name="condition" defaultValue={params.condition ?? (deals ? '' : 'nm')} className={FIELD}>
            {deals && <option value="">Any condition</option>}
            <option value="nm">Near Mint</option>
            <option value="sp">Slightly Played</option>
            <option value="mp">Moderately Played</option>
          </select>
        </Field>
      )}
      <Field label="Language" id="f-lang">
        <select id="f-lang" name="lang" defaultValue={params.lang ?? ''} className={FIELD}>
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="de">German</option>
        </select>
      </Field>
      {deals && (
        <>
          <Field label="Type" id="f-kind">
            <select id="f-kind" name="kind" defaultValue={params.kind ?? ''} className={FIELD}>
              <option value="">Singles and sealed</option>
              <option value="single">Singles</option>
              <option value="sealed">Sealed</option>
            </select>
          </Field>
          <Field label="Min. saving" id="f-min">
            <select id="f-min" name="min" defaultValue={params.minPct === null ? '' : String(params.minPct)} className={FIELD}>
              <option value="">20% (all deals)</option>
              <option value="30">30%+</option>
              <option value="40">40%+</option>
              <option value="50">50%+</option>
            </select>
          </Field>
          <Field label="Max. price (€)" id="f-max">
            <input
              id="f-max" type="number" name="max" min="1" max="100000" step="1" inputMode="numeric"
              defaultValue={params.maxPriceCents === null ? '' : params.maxPriceCents / 100}
              className={`${FIELD} w-28`}
            />
          </Field>
        </>
      )}
      <button type="submit" className="min-h-11 rounded-full bg-gold px-5 text-[13px] font-bold text-[#0a0c1e]">Apply</button>
      {hasActiveFilters(params) && (
        <a href={clearFiltersHref(params)} className="flex min-h-11 items-center px-2 text-[13px] text-mute underline hover:text-white">Clear filters</a>
      )}
    </form>
  );
}
