'use client';

import { useActionState, useState } from 'react';
import type { FormState } from '@/auth/actions';

const input =
  'mt-1.5 block min-h-11 w-full rounded-[10px] border border-white/40 bg-white/[0.06] px-3 text-base text-ink placeholder:text-mute focus:border-gold';

export function LoginForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled, so the email survives React's form reset after a failed attempt. The password does not.
  const [email, setEmail] = useState('');
  // Hidden while pending, so a repeated error is re-inserted and announced again.
  const error = pending ? undefined : state.error;
  const errorId = error ? 'login-error' : undefined;
  return (
    <>
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-ink">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={errorId}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={errorId}
            className={input}
          />
        </div>
        {error && (
          <p id="login-error" role="alert" className="rounded-[10px] border border-holo-pink/60 bg-holo-pink/10 px-3 py-2 text-sm text-[#ffc2d1]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-gradient-to-r from-gold to-[#f8a14a] px-5 text-sm font-bold text-[#2a1700] hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
        >
          Log in
        </button>
      </form>
      <p className="mt-5 text-sm text-mute">Forgot your password? Ask the owner for a new starting password.</p>
    </>
  );
}
