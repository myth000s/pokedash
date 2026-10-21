import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from './helpers/db';
import type { Db } from '@/db/client';

const TABLES = ['products', 'benchmark_snapshots', 'listings', 'listing_price_history', 'fx_rates', 'us_reference_prices'];
const setupSql = [
  'CREATE ROLE anon NOLOGIN',
  'CREATE ROLE authenticated NOLOGIN',
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated',
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated',
];

let db: Db;
const rows = async <T>(q: ReturnType<typeof sql>) =>
  ((await db.execute(q)) as unknown as { rows: T[] }).rows;
const has = async (role: string, table: string, priv: string) =>
  (await rows<{ ok: boolean }>(sql`SELECT has_table_privilege(${role}, ${'public.' + table}, ${priv}) AS ok`))[0].ok;

beforeAll(async () => {
  db = await createTestDb({ setupSql });
});

const publicTables = async () =>
  (
    await rows<{ relname: string }>(
      sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`,
    )
  ).map((r) => r.relname);

describe('database roles and RLS', () => {
  it('enables RLS on every public table with policies only for the pokedash roles', async () => {
    const tables = await publicTables();
    for (const t of TABLES) expect(tables).toContain(t);
    for (const t of tables) {
      const rel = await rows<{ relrowsecurity: boolean }>(
        sql`SELECT relrowsecurity FROM pg_class WHERE oid = ${'public.' + t}::regclass`,
      );
      expect(rel[0].relrowsecurity, t).toBe(true);
      const pol = await rows<{ policyname: string; cmd: string; roles: string[] }>(
        sql`SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' AND tablename = ${t} ORDER BY policyname`,
      );
      expect(pol.map((p) => ({ policyname: p.policyname, cmd: p.cmd, roles: p.roles })), t).toEqual([
        { policyname: 'pokedash_app_read', cmd: 'SELECT', roles: ['pokedash_app'] },
        { policyname: 'pokedash_ingest_all', cmd: 'ALL', roles: ['pokedash_ingest'] },
      ]);
    }
    const stray = await rows<{ tablename: string; policyname: string }>(
      sql`SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND NOT (roles <@ ARRAY['pokedash_app','pokedash_ingest']::name[])`,
    );
    expect(stray).toEqual([]);
  });

  it('gives anon and authenticated no table or sequence privileges', async () => {
    for (const t of await publicTables())
      for (const role of ['anon', 'authenticated'])
        for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
          expect(await has(role, t, p), `${role} ${p} ${t}`).toBe(false);
    const seqs = await rows<{ relname: string }>(
      sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S'`,
    );
    expect(seqs.length).toBeGreaterThan(0);
    for (const s of seqs)
      for (const role of ['anon', 'authenticated']) {
        const r = await rows<{ ok: boolean }>(sql`SELECT has_sequence_privilege(${role}, ${'public.' + s.relname}, 'USAGE') AS ok`);
        expect(r[0].ok, `${role} ${s.relname}`).toBe(false);
      }
  });

  it('gives the pokedash roles no TRUNCATE and no DDL rights', async () => {
    for (const t of await publicTables()) {
      expect(await has('pokedash_ingest', t, 'TRUNCATE'), t).toBe(false);
      expect(await has('pokedash_app', t, 'TRUNCATE'), t).toBe(false);
    }
    for (const role of ['pokedash_app', 'pokedash_ingest']) {
      const r = await rows<{ ok: boolean }>(sql`SELECT has_schema_privilege(${role}, 'public', 'CREATE') AS ok`);
      expect(r[0].ok, role).toBe(false);
    }
  });

  it('lets pokedash_app read but not write', async () => {
    const seeded = await rows<{ id: number }>(
      sql`INSERT INTO products (cardmarket_id, name, kind, category_name, cardmarket_expansion_id, set_key, updated_at) VALUES (900, 'seed', 'single', 'c', 1, 's', now()) RETURNING id`,
    );
    await db.execute(sql`SET ROLE pokedash_app`);
    try {
      const seen = await rows<{ id: number }>(sql`SELECT id FROM products WHERE id = ${seeded[0].id}`);
      expect(seen).toHaveLength(1);
      const err = await db.execute(sql`INSERT INTO fx_rates DEFAULT VALUES`).then(
        () => null,
        (e: unknown) => e as Error & { cause?: Error },
      );
      expect(err).not.toBeNull();
      expect(`${err?.message} ${err?.cause?.message}`).toMatch(/permission denied/);
    } finally {
      await db.execute(sql`RESET ROLE`);
      await db.execute(sql`DELETE FROM products WHERE id = ${seeded[0].id}`);
    }
  });

  it('lets pokedash_ingest insert, update and delete', async () => {
    await db.execute(sql`SET ROLE pokedash_ingest`);
    try {
      const ins = await rows<{ id: number }>(
        sql`INSERT INTO products (cardmarket_id, name, kind, category_name, cardmarket_expansion_id, set_key, updated_at) VALUES (1, 'n', 'single', 'c', 1, 's', now()) RETURNING id`,
      );
      const id = ins[0].id;
      const upd = await rows<{ id: number }>(sql`UPDATE products SET name = 'm' WHERE id = ${id} RETURNING id`);
      expect(upd).toHaveLength(1);
      const del = await rows<{ id: number }>(sql`DELETE FROM products WHERE id = ${id} RETURNING id`);
      expect(del).toHaveLength(1);
    } finally {
      await db.execute(sql`RESET ROLE`);
    }
  });

  it('grants future tables automatically', async () => {
    const fresh = await createTestDb({ setupSql });
    await fresh.execute(sql`CREATE TABLE public.future_t (id serial primary key)`);
    const priv = async (role: string, p: string) =>
      ((await fresh.execute(sql`SELECT has_table_privilege(${role}, 'public.future_t', ${p}) AS ok`)) as unknown as { rows: { ok: boolean }[] }).rows[0].ok;
    expect(await priv('pokedash_app', 'SELECT')).toBe(true);
    expect(await priv('pokedash_ingest', 'INSERT')).toBe(true);
    expect(await priv('anon', 'SELECT')).toBe(false);
  });
});
