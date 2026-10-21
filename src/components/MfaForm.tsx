'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { Enrolment, EnrolmentResult, FormState } from '@/auth/actions';

type VerifyAction = (prev: FormState, form: FormData) => Promise<FormState>;

const input =
  'mt-1.5 block min-h-11 w-full rounded-[10px] border border-white/40 bg-white/[0.06] px-3 text-base tracking-[0.3em] text-ink placeholder:text-mute focus:border-gold';
const alert = 'rounded-[10px] border border-holo-pink/60 bg-holo-pink/10 px-3 py-2 text-sm text-[#ffc2d1]';
const primary =
  'mt-1 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-gradient-to-r from-gold to-[#f8a14a] px-5 text-sm font-bold text-[#2a1700] hover:brightness-110 disabled:cursor-wait disabled:opacity-70';

/**
 * The TOTP step. `verify` asks for a code from the existing factor. `enrol` waits for the
 * "Set up authenticator" button before it creates a factor, so rendering the page never enrols.
 */
export function MfaForm({
  mode,
  verifyAction,
  startEnrolment,
}: {
  mode: 'enrol' | 'verify';
  verifyAction: VerifyAction;
  startEnrolment: () => Promise<EnrolmentResult>;
}) {
  return mode === 'verify' ? <CodeForm action={verifyAction} /> : <Enrol verifyAction={verifyAction} startEnrolment={startEnrolment} />;
}

function Enrol({ verifyAction, startEnrolment }: { verifyAction: VerifyAction; startEnrolment: () => Promise<EnrolmentResult> }) {
  const [result, start, pending] = useActionState<EnrolmentResult | null>(() => startEnrolment(), null);

  if (result && 'factorId' in result) return <Enrolled enrolment={result} verifyAction={verifyAction} />;

  // Hidden while pending, so a repeated error is re-inserted and announced again.
  const error = pending ? undefined : result?.error;
  return (
    <form action={start} className="flex flex-col gap-4">
      {error && <p role="alert" className={alert}>{error}</p>}
      <button type="submit" disabled={pending} className={primary}>
        Set up authenticator
      </button>
    </form>
  );
}

function Enrolled({ enrolment, verifyAction }: { enrolment: Enrolment; verifyAction: VerifyAction }) {
  const intro = useRef<HTMLParagraphElement>(null);
  // The set-up button that had focus is gone, so focus moves to the instructions that replaced it.
  useEffect(() => intro.current?.focus(), []);
  return (
    <div className="flex flex-col gap-4">
      <p ref={intro} tabIndex={-1} className="text-sm text-ink">
        Scan this QR code with an authenticator app (for example Aegis, 2FAS, Google Authenticator or 1Password), then enter the 6-digit code.
      </p>
      {/* A plain img for Supabase's data: URI (the CSP allows data: images). White backing, so it scans on the dark panel. */}
      <img src={enrolment.qrCode} alt="QR code for your authenticator app" width={192} height={192} className="mx-auto rounded-[10px] bg-white p-3" />
      <div>
        <p className="text-sm text-mute">Can&apos;t scan it? Enter this key in the app instead:</p>
        <code className="mt-1.5 block rounded-[10px] bg-white/[0.06] px-3 py-2 font-mono text-sm break-all text-ink select-all">{enrolment.secret}</code>
      </div>
      <CodeForm action={verifyAction} factorId={enrolment.factorId} />
    </div>
  );
}

function CodeForm({ action, factorId }: { action: VerifyAction; factorId?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const error = pending ? undefined : state.error;
  const errorId = error ? 'mfa-error' : undefined;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {factorId && <input type="hidden" name="factorId" value={factorId} />}
      <div>
        <label htmlFor="code" className="text-sm font-medium text-ink">6-digit code</label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          aria-describedby={errorId}
          className={input}
        />
      </div>
      {error && <p id="mfa-error" role="alert" className={alert}>{error}</p>}
      <button type="submit" disabled={pending} className={primary}>
        Verify
      </button>
    </form>
  );
}
