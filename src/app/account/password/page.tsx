import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { requireAuthState } from '@/auth/session';
import { changePassword } from '@/auth/actions';
import { PasswordForm } from '@/components/PasswordForm';
import { SignOutButton } from '@/components/SignOutButton';

export const metadata: Metadata = { title: 'Change password · pokedash' };

// AAL2 only (ruling R2): MFA comes first, then the password. The proxy sends users who still
// have the owner's starting password here; signed-in users may also come to change theirs.
async function Password() {
  await connection();
  const state = await requireAuthState(['needs-password-change', 'ok']);
  return (
    <>
      <p className="mb-5 text-sm text-mute">
        {state.status === 'needs-password-change'
          ? 'Replace the starting password from the owner with one only you know.'
          : 'Choose a new password for your account.'}
      </p>
      <PasswordForm action={changePassword} />
    </>
  );
}

function PasswordSkeleton() {
  const block = 'animate-pulse rounded-[10px] bg-white/[0.06]';
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className={`${block} h-10`} />
        <div className={`${block} h-[5.5rem]`} />
        <div className={`${block} h-[4.25rem]`} />
        <div className={`${block} mt-1 h-11`} />
      </div>
    </div>
  );
}

export default function PasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="holo-ring w-full max-w-sm">
        {/* p-6 keeps the 2px focus outline (+2px offset) of the fields inside the ring's overflow clip. */}
        <section className="relative rounded-2xl bg-[rgba(10,12,30,0.93)] p-6 sm:p-8">
          <h1 className="w-fit bg-gradient-to-r from-holo-cyan via-holo-purple via-60% to-holo-pink bg-clip-text font-display text-3xl tracking-wide text-transparent">
            pokedash
          </h1>
          <h2 className="mt-1 mb-2 text-lg font-semibold text-ink">Choose your password</h2>
          <Suspense fallback={<PasswordSkeleton />}>
            <Password />
          </Suspense>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.13] pt-4">
            <p className="text-sm text-mute">Wrong account?</p>
            <SignOutButton />
          </div>
        </section>
      </div>
    </main>
  );
}
