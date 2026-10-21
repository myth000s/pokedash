// Shared by the deal feed and the section tables.
export interface ResultFilter {
  active: boolean;
  /** How many items existed before filtering; 0 means the list was empty anyway. */
  totalBefore: number;
  clearHref: string;
}

export function ResultLine({ count, noun }: { count: number; noun: 'deal' | 'product' }) {
  return (
    <p role="status" className="mb-3 text-xs text-mute">
      {count === 1 ? `1 ${noun} matches your filters` : `${count} ${noun}s match your filters`}
    </p>
  );
}

export function NothingMatches({ clearHref }: { clearHref: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/25 bg-white/[0.06] p-8 text-center">
      <p className="font-display text-lg">Nothing matches your filters.</p>
      <a href={clearHref} className="mt-2 inline-flex min-h-11 items-center text-sm text-gold underline">Clear filters</a>
    </div>
  );
}
