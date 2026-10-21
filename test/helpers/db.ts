import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { Db } from '@/db/client';

/** Fresh in-memory Postgres with the real migrations applied. */
export async function createTestDb(options: { setupSql?: string[] } = {}): Promise<Db> {
  const client = new PGlite();
  for (const stmt of options.setupSql ?? []) await client.exec(stmt);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return db as unknown as Db;
}
