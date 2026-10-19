const block = 'animate-pulse rounded-xl border border-white/[0.13] bg-white/[0.06]';

export function FeedSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading deals…</span>
      <div aria-hidden="true">
        <div className="mb-4 h-8 w-64 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="my-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className={`${block} h-[66px]`} />)}
        </div>
        <div className={`${block} h-56 rounded-[18px]`} />
        <div className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className={`${block} h-72`} />)}
        </div>
      </div>
    </div>
  );
}
