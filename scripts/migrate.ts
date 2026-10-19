import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '../src/db/client';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and run again.');
    process.exitCode = 1;
    return;
  }
  const db = createDb(url);
  try {
    // createDb returns a generic Db type; the postgres-js migrator needs the concrete one.
    await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: 'drizzle' });
    console.log('Migrations applied.');
  } finally {
    const client = (db as unknown as { $client?: { end?: () => Promise<void> } }).$client;
    await client?.end?.();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : 'unknown error');
  process.exitCode = 1;
});
