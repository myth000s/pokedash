export const REQUIRED_SERVER_ENV = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const;

type Env = Record<string, string | undefined>;

export function missingServerEnv(env: Env): string[] {
  return REQUIRED_SERVER_ENV.filter((name) => !env[name]);
}

// Prints variable names only, never values.
export function checkServerEnv(env: Env): void {
  const missing = missingServerEnv(env);
  if (missing.length === 0) return;
  const message = `Missing server env: ${missing.join(', ')}`;
  if (env.VERCEL_ENV === 'production') throw new Error(message);
  console.warn(message);
}
