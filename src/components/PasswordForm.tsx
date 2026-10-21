'use client';

import { useActionState } from 'react';
import type { FormState } from '@/auth/actions';

const input =
  'mt-1.5 block min-h-11 w-full rounded-[10px] border border-white/40 bg-white/[0.06] px-3 text-base text-ink placeholder:text-mute focus:border-gold';

/**
 * The new password, twice. The server action checks the length and the match: no maxLength here,
 * so a longer pasted password is refused with a message instead of silently cut short.
 */
export function PasswordForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  // Hidden while pending, so a repeated error is re-inserted and announced again.
  const error = pending ? undefined : state.error;
  const errorId = error ? 'password-error' : undefined;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="password" className="text-sm font-medium text-ink">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby={errorId ? `password-hint ${errorId}` : 'password-hint'}
          className={input}
        />
        <p id="password-hint" className="mt-1.5 text-xs text-mute">12 to 72 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="text-sm font-medium text-ink">Repeat new password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby={errorId}
          className={input}
        />
      </div>
      {error && (
        <p id="password-error" role="alert" className="rounded-[10px] border border-holo-pink/60 bg-holo-pink/10 px-3 py-2 text-sm text-[#ffc2d1]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-gradient-to-r from-gold to-[#f8a14a] px-5 text-sm font-bold text-[#2a1700] hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
      >
        Change password
      </button>
    </form>
  );
}
