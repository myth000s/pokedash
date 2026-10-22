import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Logger } from 'drizzle-orm/logger';
import * as schema from '@/db/schema';
import type { Db } from '@/db/client';

/** Fresh in-memory Postgres with the real migrations applied. */
export async function createTestDb(options: { setupSql?: string[]; logger?: Logger } = {}): Promise<Db> {
  const client = new PGlite();
  for (const stmt of options.setupSql ?? []) await client.exec(stmt);
  const db = drizzle(client, { schema, logger: options.logger });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return db as unknown as Db;
}
