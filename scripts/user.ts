// The owner's account tool. pokedash sends no emails, so accounts are created and reset here:
//   npm run user[:prod] -- add <email>     creates a confirmed account with a random starting password
//   npm run user[:prod] -- reset <email>   gives an existing account a new starting password
// Both print the starting password once and flag the account so the user must change it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateStartingPassword } from '../src/auth/password';

const USAGE = 'Usage: npm run user -- add <email>  or  npm run user -- reset <email>  (user:prod for the online project)';
const PER_PAGE = 1000;
const MAX_PAGES = 100;

/** A failure with a short message that is safe to print: no email, password or key. */
class UserScriptError extends Error {}

type ApiError = { status?: number; code?: string };

function apiFailure(action: string, error: ApiError): string {
  if (!error.status) return `Could not ${action}: Supabase is not reachable. Is SUPABASE_URL right and Supabase running?`;
  if (error.status === 401 || error.status === 403) return `Could not ${action}: Supabase refused the secret key. Check SUPABASE_SECRET_KEY.`;
  return `Could not ${action} (${error.code ?? `HTTP ${error.status}`}).`;
}

async function addUser(supabase: SupabaseClient, email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });
  if (error?.code === 'email_exists') throw new UserScriptError('That email already has an account. Use reset to give it a new starting password.');
  if (error) throw new UserScriptError(apiFailure('add the user', error));
}

async function findUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  // Pages until an empty one, so a server-side page-size cap can't hide a user.
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new UserScriptError(apiFailure('look up the user', error));
    if (data.users.length === 0) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
  }
  throw new UserScriptError(`Could not look up the user: more than ${MAX_PAGES * PER_PAGE} accounts.`);
}

async function resetUser(supabase: SupabaseClient, email: string, password: string): Promise<void> {
  const id = await findUserId(supabase, email);
  if (!id) throw new UserScriptError('No account has that email. Use add to create one.');
  const { error } = await supabase.auth.admin.updateUserById(id, {
    password,
    user_metadata: { must_change_password: true },
  });
  if (error) throw new UserScriptError(apiFailure('reset the password', error));
}

async function main(): Promise<void> {
  const [command, rawEmail, ...extra] = process.argv.slice(2);
  if ((command !== 'add' && command !== 'reset') || !rawEmail || extra.length > 0) throw new UserScriptError(USAGE);
  const email = rawEmail.trim().toLowerCase();
  if (!z.email().safeParse(email).success) throw new UserScriptError('That is not a valid email address.');

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new UserScriptError('SUPABASE_URL and SUPABASE_SECRET_KEY must be set (.env.local, or .env.supabase for user:prod).');

  const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = generateStartingPassword();
  if (command === 'add') await addUser(supabase, email, password);
  else await resetUser(supabase, email, password);
  // Do not print passwords; report only non-sensitive status.
  console.log(`User ${command === 'add' ? 'created' : 'updated'} successfully. Share credentials using a secure channel.`);
}

main().catch((err) => {
  console.error(err instanceof UserScriptError ? err.message : `The user script failed (${err instanceof Error ? err.name : 'unknown error'}).`);
  process.exitCode = 1;
});
