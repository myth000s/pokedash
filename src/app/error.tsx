'use client';

// Shown when rendering any page fails. Deliberately shows no error details.
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <div className="rounded-2xl border border-white/[0.13] bg-white/[0.06] p-8 text-center">
        <p className="font-display text-lg text-ink">Couldn&apos;t load this page right now.</p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-[10px] bg-gradient-to-r from-gold to-[#f8a14a] px-5 text-sm font-bold text-[#2a1700] hover:brightness-110"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
