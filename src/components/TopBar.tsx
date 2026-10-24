import { formatAge } from '@/lib/format';
import { Logo } from './Logo';
import { SignOutButton } from './SignOutButton';

export function TopBar({ setName, lastCheckedAt, now }: { setName: string | null; lastCheckedAt: Date | null; now: Date }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="flex items-center gap-2">
        <Logo size={32} />
        <span className="bg-gradient-to-r from-holo-cyan via-holo-purple via-60% to-holo-pink bg-clip-text font-display text-2xl tracking-wide text-transparent">
          pokedash
        </span>
      </h1>
      <span className="rounded-full border border-white/[0.13] bg-white/[0.06] px-3 py-1 text-xs text-mute">
        {setName === null ? 'All sets' : `Set: ${setName}`}
      </span>
      <p className="ml-auto flex items-center gap-2 text-xs text-mute">
        <span className="live-dot" aria-hidden="true" />
        {lastCheckedAt ? `Live · checked ${formatAge(lastCheckedAt, now)}` : 'Not checked yet'}
      </p>
      <SignOutButton />
    </div>
  );
}
