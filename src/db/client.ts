import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string, options: { quiet?: boolean; max?: number; idle_timeout?: number } = {}): Db {
  // prepare: false is required by the Supabase transaction pooler.
  const client = postgres(url, {
    prepare: false,
    ...(options.quiet ? { onnotice: () => {} } : {}),
    ...(options.max !== undefined ? { max: options.max } : {}),
    ...(options.idle_timeout !== undefined ? { idle_timeout: options.idle_timeout } : {}),
  });
  return drizzle(client, { schema }) as unknown as Db;
}

/** Ends the underlying postgres connection of a Db made by createDb. */
export async function closeDb(db: Db): Promise<void> {
  const client = (db as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}

const globalForDb = globalThis as unknown as { __pokedashDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__pokedashDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.__pokedashDb = createDb(url, { max: 3, idle_timeout: 20 });
  }
  return globalForDb.__pokedashDb;
}
