import { signOut } from '@/auth/actions';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-white/[0.13] bg-white/[0.06] px-3.5 text-sm text-ink hover:bg-white/[0.12]"
      >
        Sign out
      </button>
    </form>
  );
}
