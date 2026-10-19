import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string): Db {
  return drizzle(postgres(url), { schema }) as unknown as Db;
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
    globalForDb.__pokedashDb = createDb(url);
  }
  return globalForDb.__pokedashDb;
}
