import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { requireAuthState } from '@/auth/session';
import { signIn } from '@/auth/actions';
import { LoginForm } from '@/components/LoginForm';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = { title: 'Log in · pokedash' };

// Reads the session on every request, so it streams in behind Suspense. connection() keeps it
// request-time even when Supabase is unconfigured at build. Signed-in users go to their next step.
async function Login() {
  await connection();
  await requireAuthState(['anonymous']);
  return <LoginForm action={signIn} />;
}

function LoginSkeleton() {
  const block = 'animate-pulse rounded-[10px] bg-white/[0.06]';
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className={`${block} h-[4.25rem]`} />
        <div className={`${block} h-[4.25rem]`} />
        <div className={`${block} mt-1 h-11`} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="holo-ring w-full max-w-sm">
        {/* p-6 keeps the 2px focus outline (+2px offset) of the fields inside the ring's overflow clip. */}
        <section className="relative rounded-2xl bg-[rgba(10,12,30,0.93)] p-6 sm:p-8">
          <h1 className="flex items-center gap-3">
            <Logo size={44} />
            <span className="bg-gradient-to-r from-holo-cyan via-holo-purple via-60% to-holo-pink bg-clip-text font-display text-3xl tracking-wide text-transparent">
              pokedash
            </span>
          </h1>
          <p className="mt-1 mb-6 text-sm text-mute">Pokémon TCG deals against Cardmarket market values.</p>
          <Suspense fallback={<LoginSkeleton />}>
            <Login />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
