'use client';

// Shown when loading the deal feed fails. Deliberately shows no error details.
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div className="rounded-xl border border-dashed border-zinc-400 bg-white p-8 text-center">
        <p className="text-base font-medium text-zinc-900">Couldn&apos;t load deals right now.</p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
