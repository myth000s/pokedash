import { clearFiltersHref, hasActiveFilters, type DashboardParams } from '@/lib/params';

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

// A plain GET form to the same page: works without JavaScript, and every filter lives in the URL.
export function FilterBar({ params }: { params: DashboardParams }) {
  const deals = params.tab === 'deals';
  return (
    <form method="get" role="search" aria-label="Filters" className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.13] bg-white/[0.06] p-3">
      <input type="hidden" name="tab" value={params.tab} />
      {params.tab === 'singles' && params.allSingles && <input type="hidden" name="all" value="1" />}
      {params.tab === 'sealed' && params.sealedType && <input type="hidden" name="type" value={params.sealedType} />}
      <Field label="Search" id="f-q" grow>
        <input id="f-q" type="search" name="q" defaultValue={params.q} placeholder="Search by name…" maxLength={100} className={FIELD} />
      </Field>
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
