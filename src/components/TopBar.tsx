import { formatAge } from '@/lib/format';

export function TopBar({ setName, lastCheckedAt, now }: { setName: string; lastCheckedAt: Date | null; now: Date }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="bg-gradient-to-r from-holo-cyan via-holo-purple via-60% to-gold bg-clip-text font-display text-2xl tracking-wide text-transparent">
        pokedash
      </h1>
      <span className="rounded-full border border-white/[0.13] bg-white/[0.06] px-3 py-1 text-xs text-mute">
        Set: {setName}
      </span>
      <p className="ml-auto flex items-center gap-2 text-xs text-mute">
        <span className="live-dot" aria-hidden="true" />
        {lastCheckedAt ? `Live · checked ${formatAge(lastCheckedAt, now)}` : 'Not checked yet'}
      </p>
    </div>
  );
}
