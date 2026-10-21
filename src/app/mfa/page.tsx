import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { requireAuthState } from '@/auth/session';
import { startEnrolment, verifyMfa } from '@/auth/actions';
import { MfaForm } from '@/components/MfaForm';
import { SignOutButton } from '@/components/SignOutButton';

export const metadata: Metadata = { title: 'Authenticator code · pokedash' };

// Reads the session on every request, so it streams in behind Suspense, after connection().
// Only a password-verified (AAL1) session gets here; the mode comes from the session's factors.
// Rendering never enrols: MfaForm calls startEnrolment from its "Set up authenticator" button.
async function Mfa() {
  await connection();
  const state = await requireAuthState(['needs-mfa-enrolment', 'needs-mfa-verification']);
  const mode = state.status === 'needs-mfa-enrolment' ? 'enrol' : 'verify';
  return (
    <>
      <p className="mb-5 text-sm text-mute">
        {mode === 'enrol'
          ? 'Every login also needs a code from an authenticator app on your phone. Set one up once, now.'
          : 'Open your authenticator app and enter the current code.'}
      </p>
      {/* Keyed by mode, so a change of mode starts the form fresh. */}
      <MfaForm key={mode} mode={mode} verifyAction={verifyMfa} startEnrolment={startEnrolment} />
    </>
  );
}

function MfaSkeleton() {
  const block = 'animate-pulse rounded-[10px] bg-white/[0.06]';
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className={`${block} h-10`} />
        <div className={`${block} h-[4.25rem]`} />
        <div className={`${block} mt-1 h-11`} />
      </div>
    </div>
  );
}

export default function MfaPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="holo-ring w-full max-w-sm">
        {/* p-6 keeps the 2px focus outline (+2px offset) of the fields inside the ring's overflow clip. */}
        <section className="relative rounded-2xl bg-[rgba(10,12,30,0.93)] p-6 sm:p-8">
          <h1 className="w-fit bg-gradient-to-r from-holo-cyan via-holo-purple via-60% to-gold bg-clip-text font-display text-3xl tracking-wide text-transparent">
            pokedash
          </h1>
          <h2 className="mt-1 mb-2 text-lg font-semibold text-ink">Two-step login</h2>
          <Suspense fallback={<MfaSkeleton />}>
            <Mfa />
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
