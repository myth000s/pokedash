# pokedash online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put pokedash online as a private, invite-only web service. It needs password and TOTP login, automatic scheduled ingestion, hardened security, and German legal pages, all on free hosting.

**Architecture:**
- Hosting: Next.js 16 on Vercel (fra1). Supabase Free (Frankfurt) provides Postgres and Auth. GitHub Actions runs the ingest on a schedule.
- Auth: all Supabase Auth calls run on the server: server actions, server components, and `proxy`, through `@supabase/ssr` with HTTP-only cookies. The browser only ever talks to pokedash itself.
- Access control: data pages and the image proxy call one `requireAal2()` / `getAuthState()` check inside the request-time part of each page.
- Database: the app reads through a SELECT-only Postgres role. The ingest writes through its own role. RLS policies cover only those two roles, so the Supabase Data API exposes nothing.

**Tech Stack:** Next.js 16.4.2 (App Router, `cacheComponents`), React 19, TypeScript strict, Tailwind v4, Drizzle ORM + postgres-js, PGlite + Vitest 5 for tests, `@supabase/ssr` 0.12.x + `@supabase/supabase-js` 2.118.x, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-20-pokedash-online-design.md` (approved 2026-10-20). Read it before any task; §11 holds the settled details.

## Global Constraints

**Next.js and dependencies**
- Next.js 16.4.2 with `cacheComponents: true` and `partialPrefetching: true` (both stay on).
  - Request data goes inside `<Suspense>`, after `await connection()`.
  - `searchParams` is a Promise.
  - Before writing Next code, read the relevant guide in `node_modules/next/dist/docs/`: `proxy.md`, `authentication-with-cache-components.md`, `content-security-policy.md`, `route.md`, `server-actions.md`.
- Add no paid service, no analytics, no third-party scripts, no client-side Supabase client, and no `NEXT_PUBLIC_*` secret.

**Login and access**
- Every page and route requires a session at AAL2, except:
  - `/login`, `/impressum`, `/datenschutz` (public)
  - `/mfa` (requires a session at AAL1)
- `/account/password` requires AAL2.
- No auth bypass of any kind, in any environment.
- Login is email + password + required TOTP. pokedash sends no emails. Sign-up is disabled.
- Passwords: minimum 12, maximum 72 characters. Starting passwords are random, at least 24 characters, and printed once to the owner's terminal only.

**Secrets and personal data**
- Never open, print, grep or commit `.env.local` or `.env.supabase`. Both are git-ignored by `.env*`.
- `.env.example` keeps every secret empty.
- No email addresses, IPs, tokens or passwords in logs.
- The Impressum and Datenschutz values come only from env vars `IMPRINT_NAME`, `IMPRINT_STREET`, `IMPRINT_POSTAL_CITY`, `IMPRINT_EMAIL`. The owner's personal details never appear in the repo, in tests or in fixtures.

**Database**
- Roles: `pokedash_app` (SELECT only) and `pokedash_ingest` (SELECT/INSERT/UPDATE/DELETE).
- Migrations run as `postgres` from the owner's PC only.
- RLS is enabled on every `public` table, with policies only for those two roles.
- postgres-js uses `prepare: false` everywhere, for the Supabase transaction pooler.

**Image proxy**
- `/api/card-image` fetches only `https://cardtrader.com/…` or `https://www.cardtrader.com/…`, with no credentials or port in the URL.
- It allows at most 3 redirects, each to those hosts. The response must be `image/jpeg|png|webp|gif|avif` (never SVG) and at most 2 MB (2 × 1024 × 1024 bytes).
- It answers with `Cache-Control: private, max-age=86400`.

**Retention and size**
- Retention: unavailable listings older than 30 days (by `last_seen_at`) together with their price history; listing price history older than 90 days; US reference prices older than 30 days; benchmark snapshots older than 365 days.
- Size alert: the daily job fails above 400 MB (`400 * 1024 * 1024` bytes).

**Ingest schedule**
- Listings: cron `5,35 * * * *`.
- Daily: cron `20 1 * * *` (UTC).
- One shared `concurrency` group `ingest`, 15-minute job timeout, `permissions: contents: read`.

**Language**
- UI copy is English.
- The Impressum and Datenschutz pages are German (`lang="de"` on their `<main>`). The footer labels are "Impressum" and "Datenschutz".

**Git**
- Work on branch `feat/online`, created from `main`.
- The first commit adds the spec and this plan.
- Commit with explicit paths, never `git add -A`.
- Don't push or merge unless the owner asks.

## Review Focus

1. Hostile image URLs. `src` values like:
   - `https://cardtrader.com.evil.example/x.jpg`
   - `http://cardtrader.com/x.jpg`
   - `https://user:pw@cardtrader.com/x.jpg`
   - `https://cardtrader.com:8443/x.jpg`

   Also an upstream redirect to another host, an `image/svg+xml` response, and a body over 2 MB with no `Content-Length`. Each must be refused without passing bytes through. Pinned in Task 10.
2. Stale or broken session.
   - An expired or invalid token, or `getClaims` returning an error, must count as anonymous: redirect to `/login`, or 401 for `/api/*`. It must never become an error page that leaks details. Pinned in Tasks 6 and 7.
   - A stale tab submitting a server action after sign-out gets a redirect to `/login`. Pinned in Task 8.
3. Missing configuration fails closed.
   - A Preview deployment, or Production with `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` unset, must show the login page with "Login is not available right now.", never data and never a stack trace. Pinned in Tasks 6 and 8.
   - The env check runs at server start. It throws on Vercel Production when a value is missing and names only the variable names. Pinned in Task 5.
4. Interrupted MFA enrolment. A user who scanned the QR code but closed the tab before confirming must be able to start again. Leftover unverified TOTP factors are removed before a new enrolment. Pinned in Task 9.
5. Login input.
   - `" Friend@Example.COM "` is trimmed and lower-cased.
   - A wrong password and an unknown email give the identical message "Email or password is wrong."
   - A Supabase rate-limit error (HTTP 429) gives "Too many attempts. Wait a few minutes and try again."

   Pinned in Task 8.

---

### Task 1: Dependency hygiene, zero `npm audit` findings

`npm audit` reports 9 findings today, all in dev tools:
- `drizzle-kit` pulls in old `esbuild` through `@esbuild-kit/core-utils`.
- `eslint-config-next` pulls in `@next/eslint-plugin-next`, which pulls in `fast-glob`, then `micromatch`, then `braces`. GHSA-vfj7-8cjw-p6xm affects every braces version, and none has a fix.

The fix:
- Override esbuild for the drizzle-kit chain.
- Replace `eslint-config-next` with the same plugins configured directly, without `@next/eslint-plugin-next`. Those plugins are already installed as its dependencies.

**Files:**
- Modify: `package.json`, `package-lock.json`, `eslint.config.mjs`
- Modify: `src/components/CardImage.tsx` (remove the `@next/next/no-img-element` disable comment; the rule no longer exists)

**Interfaces:**
- Produces: `npm run typecheck` (`tsc --noEmit`), which later tasks and CI use.

- [ ] **Step 1: Create the branch and commit the spec and plan**

```bash
git switch -c feat/online
git add docs/superpowers/specs/2026-10-20-pokedash-online-design.md docs/superpowers/plans/2026-10-20-pokedash-online.md
git commit -m "docs: pokedash online design and plan"
```

- [ ] **Step 2: Record the starting audit**

Run: `npm audit`
Expected: `9 vulnerabilities (4 moderate, 5 high)`

- [ ] **Step 3: Override esbuild**

In `package.json` add `"overrides": { "@esbuild-kit/core-utils": { "esbuild": "^0.25.12" } }`, then run `npm install`.

- [ ] **Step 4: Replace eslint-config-next**
  - Uninstall it: `npm uninstall eslint-config-next`.
  - Add these direct dev dependencies at the versions installed today: `typescript-eslint@^8.72.0 eslint-plugin-react@^7.37.5 eslint-plugin-react-hooks@^7.1.1 eslint-plugin-jsx-a11y@^6.10.2 globals@^16.4.0`.
  - Rewrite `eslint.config.mjs` as a flat config: typescript-eslint `recommended`, react `flat.recommended` + `flat['jsx-runtime']` (with `settings.react.version: 'detect'`), react-hooks flat `recommended`, jsx-a11y `flatConfigs.recommended`, browser + node `globals`.
  - Keep the existing `globalIgnores` list and add `.vercel/**`.
  - Add the script `"typecheck": "tsc --noEmit"`.

- [ ] **Step 5: Verify**

Run: `npm audit`
Expected: `found 0 vulnerabilities`

Run: `npm run lint`
Expected: exit 0. If a newly enabled rule flags existing code, fix the code. Don't disable the rule unless it is a false positive, and if so add a one-line comment explaining why.

Run: `npm run typecheck`, then `npm test`, then `npm run build`
Expected: all exit 0, with 171+ tests passing.

Run: `npx drizzle-kit generate`
Expected: "No schema changes, nothing to migrate". This proves drizzle-kit still loads with the overridden esbuild.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json eslint.config.mjs src/components/CardImage.tsx
git commit -m "chore: clear npm audit findings (esbuild override, eslint without next plugin)"
```

---

### Task 2: Database roles, RLS, and pooler-safe connections

**Files:**
- Create: `drizzle/0006_roles_rls.sql`, through `npx drizzle-kit generate --custom --name=roles_rls`. That command also adds the journal entry and snapshot.
- Modify: `src/db/client.ts`, `test/helpers/db.ts`, `package.json`
- Test: `test/db-security.test.ts`, `src/db/client.test.ts`

**Interfaces:**
- Produces:
  - `createDb(url: string, options?: { quiet?: boolean; max?: number }): Db`, which always uses `prepare: false`.
  - `getDb()`, which uses `{ max: 3 }` and `idle_timeout: 20`.
  - `createTestDb(options?: { setupSql?: string[] }): Promise<Db>`. It runs `setupSql` before the migrations.
  - npm script `db:migrate:prod` = `tsx --env-file=.env.supabase scripts/migrate.ts`.

- [ ] **Step 1: Write the failing tests**

`test/db-security.test.ts` creates its database with `createTestDb({ setupSql })`. The `setupSql` simulates Supabase's defaults: it creates roles `anon` and `authenticated`, and runs `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated` (and the same `ON SEQUENCES`).

```ts
const TABLES = ['products', 'benchmark_snapshots', 'listings', 'listing_price_history', 'fx_rates', 'us_reference_prices'];
it('enables RLS on every public table with policies only for the pokedash roles', async () => {
  // every pg_class row in public with relkind 'r': relrowsecurity === true
  // pg_policies rows per table, exactly:
  //   { policyname: 'pokedash_app_read', cmd: 'SELECT', roles: ['pokedash_app'] }
  //   { policyname: 'pokedash_ingest_all', cmd: 'ALL', roles: ['pokedash_ingest'] }
});
it('gives anon and authenticated no table privileges', async () => {
  // for each table and each of SELECT/INSERT/UPDATE/DELETE: has_table_privilege('anon'|'authenticated', 'public.<t>', priv) === false
});
it('lets pokedash_app read but not write', async () => {
  // SET ROLE pokedash_app; SELECT from listings succeeds; INSERT into fx_rates rejects with /permission denied/; RESET ROLE
});
it('lets pokedash_ingest insert, update and delete', async () => {
  // SET ROLE pokedash_ingest; insert products row (serial id, needs sequence USAGE), update it, delete it; RESET ROLE
});
it('grants future tables automatically', async () => {
  // after migrations: CREATE TABLE public.future_t (id serial primary key)
  // has_table_privilege('pokedash_app', 'public.future_t', 'SELECT') === true
  // has_table_privilege('pokedash_ingest', 'public.future_t', 'INSERT') === true
  // has_table_privilege('anon', 'public.future_t', 'SELECT') === false
});
```

`src/db/client.test.ts`:

```ts
it('disables prepared statements for the Supabase pooler', () => {
  const db = createDb('postgres://u:p@127.0.0.1:1/x');
  expect((db as unknown as { $client: { options: { prepare: boolean } } }).$client.options.prepare).toBe(false);
});
```

The client test makes no connection; postgres-js connects lazily.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run test/db-security.test.ts src/db/client.test.ts`
Expected: FAIL. There is no RLS, the roles don't exist, and `prepare` is `true`.

- [ ] **Step 3: Write the migration `drizzle/0006_roles_rls.sql`**

Statements are separated by `--> statement-breakpoint`, as in the other migrations. The migration must be idempotent for roles, because roles are cluster-wide. It must also run where `anon` and `authenticated` don't exist (PGlite, local Docker): guard the anon/authenticated revokes with `DO $$ … IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') …`.

Content, in order:
1. Create `pokedash_app` and `pokedash_ingest` with `LOGIN`, without passwords, if they don't exist.
2. `GRANT USAGE ON SCHEMA public` to both roles.
3. Grants on existing objects:
   - `GRANT SELECT ON ALL TABLES IN SCHEMA public TO pokedash_app`
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES … TO pokedash_ingest`
   - `GRANT USAGE, SELECT ON ALL SEQUENCES … TO pokedash_ingest`
4. Default privileges with `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`: the same three grants for future tables and sequences, and (guarded) `REVOKE ALL ON TABLES / SEQUENCES / FUNCTIONS FROM anon, authenticated`.
5. Guarded: `REVOKE ALL ON ALL TABLES / ALL SEQUENCES / ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated`.
6. For each of the six tables:
   - `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
   - `CREATE POLICY pokedash_app_read ON … FOR SELECT TO pokedash_app USING (true)`
   - `CREATE POLICY pokedash_ingest_all ON … FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true)`

- [ ] **Step 4: Update `createDb`, `getDb` and `createTestDb`**
  - `createDb` and `getDb` get the options from the Interfaces block.
  - `createTestDb` executes each `setupSql` statement on the PGlite instance before `migrate`.
  - Add the `db:migrate:prod` script.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all pass, including the 6 new tests.

Run: `npm run db:migrate`, with Docker Supabase running.
Expected: "Migrations applied." on the local database.

- [ ] **Step 6: Commit**

```bash
git add drizzle/0006_roles_rls.sql drizzle/meta src/db/client.ts src/db/client.test.ts test/helpers/db.ts test/db-security.test.ts package.json
git commit -m "feat: least-privilege db roles, RLS policies, pooler-safe connections"
```

---

### Task 3: Ingest modes, data retention and size check

**Files:**
- Modify: `src/ingest/run.ts`, `scripts/ingest.ts`, `src/config/settings.ts`
- Create: `src/ingest/retention.ts`
- Test: `src/ingest/run.test.ts`, `src/ingest/retention.test.ts`

**Interfaces:**
- Produces:
  - `type IngestMode = 'all' | 'listings' | 'daily'`
  - `parseIngestMode(argv: string[]): IngestMode`, in `run.ts`: `[]` → `'all'`, `['--listings']` → `'listings'`, `['--daily']` → `'daily'`; anything else throws `Error('Unknown option: <arg>. Use --listings or --daily.')`.
  - `runIngestion(db, deps, sets, now, mode: IngestMode = 'all')`. In `'listings'` mode only the providers run: no Cardmarket, FX or US prices, and those report fields stay absent. `IngestionReport.cardmarket` becomes optional (`cardmarket?:`) so listings mode can leave it out. `scripts/ingest.ts` prints nothing for an absent step.
  - `RETENTION_DAYS = { unavailableListings: 30, listingPriceHistory: 90, usReferencePrices: 30, benchmarkSnapshots: 365 } as const` and `DB_SIZE_ALERT_BYTES = 400 * 1024 * 1024`, in `settings.ts`.
  - `cleanupOldData(db: Db, now: Date): Promise<{ listings: number; priceHistory: number; usPrices: number; benchmarks: number }>`
  - `databaseSizeBytes(db: Db): Promise<number>`, which reads `pg_database_size(current_database())`.

- [ ] **Step 1: Write the failing tests**

`src/ingest/run.test.ts`:

```ts
it('parses ingest modes', () => {
  expect(parseIngestMode([])).toBe('all');
  expect(parseIngestMode(['--listings'])).toBe('listings');
  expect(parseIngestMode(['--daily'])).toBe('daily');
  expect(() => parseIngestMode(['--nope'])).toThrow('Unknown option: --nope. Use --listings or --daily.');
});
it('runs only the listing providers in listings mode', async () => {
  // fetchJson, fetchText, ppt methods are vi.fn(); a fakeProvider returns [] listings
  // report: providers has 1 entry, cardmarket/fx/usPrices are undefined; fetchJson, fetchText and ppt never called
});
```

`src/ingest/retention.test.ts` seeds a `createTestDb()` relative to `NOW = 2026-10-20T12:00:00Z`:
- an unavailable listing last seen 31 days ago, with one price history row
- an unavailable listing last seen 29 days ago
- an available listing last seen 40 days ago, which must stay (available)
- price history rows 91 and 89 days old on the kept listing
- US price rows 31 and 29 days old
- benchmark snapshots 366 and 364 days old

```ts
it('deletes data past its retention and keeps the rest', async () => {
  expect(await cleanupOldData(db, NOW)).toEqual({ listings: 1, priceHistory: 2, usPrices: 1, benchmarks: 1 });
  // priceHistory 2 = the deleted listing's row + the 91-day-old row; remaining rows match the "kept" seeds
});
it('reports the database size in bytes', async () => {
  expect(await databaseSizeBytes(db)).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/ingest/run.test.ts src/ingest/retention.test.ts`
Expected: FAIL. The exports don't exist yet.

- [ ] **Step 3: Implement**
  - `parseIngestMode` and the `mode` parameter in `run.ts`.
  - `retention.ts`: delete the history of expiring listings before the listings, then the rest. Run it in one transaction.
  - `scripts/ingest.ts`:
    - Call `parseIngestMode(process.argv.slice(2))`. On an error, print the message and set `exitCode = 1`.
    - Pass the mode on, and skip building the PPT client in `'listings'` mode.
    - In `'daily'` mode, after ingestion and even if a step failed, run `cleanupOldData` and print `Cleanup: N listings, N price history, N US prices, N benchmarks deleted`.
    - Then print `Database size: X MB`. If the size is over `DB_SIZE_ALERT_BYTES`, print `Database size over 400 MB: shorten retention` and set `exitCode = 1`.
    - Print counts only: no URLs, no secrets.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all pass.

Run: `npm run ingest -- --listings` against local Docker.
Expected: only a `cardtrader:` line under the set, no Cardmarket/FX/US lines, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ingest/run.ts src/ingest/run.test.ts src/ingest/retention.ts src/ingest/retention.test.ts src/config/settings.ts scripts/ingest.ts
git commit -m "feat: ingest modes, data retention cleanup and db size alert"
```

---

### Task 4: GitHub workflows, Dependabot and Vercel region

**Files:**
- Create:
  - `.github/workflows/ci.yml`
  - `.github/workflows/ingest-listings.yml`
  - `.github/workflows/ingest-daily.yml`
  - `.github/workflows/codeql.yml`
  - `.github/dependabot.yml`
  - `vercel.json`

**Interfaces:**
- Consumes: `npm run typecheck` (Task 1) and `npm run ingest -- --listings | --daily` (Task 3).
- Produces: the GitHub secret names used by the README (Task 12): `INGEST_DATABASE_URL`, `CARDTRADER_TOKEN`, `POKEMONPRICETRACKER_API_KEY`.

- [ ] **Step 1: Write the workflows**

Every workflow sets `permissions: contents: read` at the top level (CodeQL adds `security-events: write` on its job). Pin every action to a full commit SHA with a `# vX.Y.Z` comment; look the SHAs up with `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag>`. Steps use `actions/checkout` and `actions/setup-node` (`node-version: 24`, `cache: npm`), then `npm ci`.

| Workflow | Triggers | Settings | Runs |
|---|---|---|---|
| `ci.yml` | `pull_request`, `push` to `main` | none | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev --audit-level=high` |
| `ingest-listings.yml` | `schedule: cron '5,35 * * * *'`, `workflow_dispatch` | `concurrency: { group: ingest, cancel-in-progress: false }`, `timeout-minutes: 15` | `npm run ingest -- --listings` |
| `ingest-daily.yml` | `schedule: cron '20 1 * * *'`, `workflow_dispatch` | same concurrency and timeout | `npm run ingest -- --daily` |
| `codeql.yml` | `push`/`pull_request` on `main`, weekly `schedule` | none | `github/codeql-action` `init` (`languages: javascript-typescript`) + `analyze` |

The ingest workflows map the env vars: `DATABASE_URL: ${{ secrets.INGEST_DATABASE_URL }}`, `CARDTRADER_TOKEN: ${{ secrets.CARDTRADER_TOKEN }}`, and `POKEMONPRICETRACKER_API_KEY: ${{ secrets.POKEMONPRICETRACKER_API_KEY }}` (daily only).

`dependabot.yml` covers the `npm` and `github-actions` ecosystems, each with a weekly schedule. npm minor and patch updates are grouped into one PR.

`vercel.json`: `{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["fra1"] }`.

- [ ] **Step 2: Validate**

Run: `docker run --rm -v "$(pwd):/repo" -w /repo rhysd/actionlint:latest -color`
Expected: no findings, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github vercel.json
git commit -m "ci: CI, scheduled ingest, CodeQL, Dependabot, Frankfurt region"
```

---

### Task 5: Security headers and server env check

**Files:**
- Create: `src/lib/securityHeaders.ts`, `src/lib/serverEnv.ts`, `src/instrumentation.ts`
- Modify: `next.config.ts`
- Test: `src/lib/securityHeaders.test.ts`, `src/lib/serverEnv.test.ts`, `test/no-raw-html.test.ts`

**Interfaces:**
- Produces:
  - `securityHeaders(opts: { dev: boolean }): { key: string; value: string }[]`
  - `REQUIRED_SERVER_ENV = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const`
  - `missingServerEnv(env: Record<string, string | undefined>): string[]`
  - `checkServerEnv(env: Record<string, string | undefined>): void`. It throws `Error('Missing server env: A, B')` when `env.VERCEL_ENV === 'production'` and something is missing. Otherwise it only `console.warn`s the same names. It never prints values.

CSP decision. Nonce-based CSP is incompatible with the prerendered static shell (see `content-security-policy.md`, "Static vs Dynamic Rendering"). So `script-src` allows `'unsafe-inline'` for Next's inline bootstrap scripts. The remaining XSS barrier is that no code renders raw HTML. `test/no-raw-html.test.ts` pins that.

- [ ] **Step 1: Write the failing tests**

```ts
// securityHeaders.test.ts
const csp = (dev: boolean) => securityHeaders({ dev }).find((h) => h.key === 'Content-Security-Policy')!.value;
it('sets a strict CSP in production', () => {
  for (const d of ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'", 'upgrade-insecure-requests']) expect(csp(false)).toContain(d);
  expect(csp(false)).not.toContain('unsafe-eval');
});
it('allows eval only in dev and skips the https upgrade there', () => {
  expect(csp(true)).toContain("'unsafe-eval'");
  expect(csp(true)).not.toContain('upgrade-insecure-requests');
});
it('sets the other headers', () => {
  expect(Object.fromEntries(securityHeaders({ dev: false }).map((h) => [h.key, h.value]))).toMatchObject({
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  expect(securityHeaders({ dev: true }).some((h) => h.key === 'Strict-Transport-Security')).toBe(false);
});
// serverEnv.test.ts
it('names missing variables without values', () => { expect(missingServerEnv({ DATABASE_URL: 'x' })).toEqual(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']); });
it('throws only on Vercel production', () => {
  expect(() => checkServerEnv({ VERCEL_ENV: 'production' })).toThrow('Missing server env: DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY');
  expect(() => checkServerEnv({ VERCEL_ENV: 'preview' })).not.toThrow();
});
// test/no-raw-html.test.ts: walk src/**/*.{ts,tsx} (skip *.test.*); no file contains 'dangerouslySetInnerHTML'
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/securityHeaders.test.ts src/lib/serverEnv.test.ts test/no-raw-html.test.ts`
Expected: FAIL. The modules are missing; the raw-HTML scan already passes.

- [ ] **Step 3: Implement**
  - `next.config.ts`:
    - Set `poweredByHeader: false`.
    - Add `async headers()` returning `[{ source: '/(.*)', headers: securityHeaders({ dev: process.env.NODE_ENV === 'development' }) }]`.
    - Import with a relative path, `./src/lib/securityHeaders`.
  - `src/instrumentation.ts`: `export function register() { checkServerEnv(process.env) }`, per `instrumentation.md`.

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: pass.

Run: `npm run build && npm run start`, then in another shell `curl -sI http://localhost:3000/impressum`.
Expected: the headers above are present, and there is no `X-Powered-By`. The 404 is fine for now: `/impressum` arrives in Task 11.

- [ ] **Step 5: Commit**

```bash
git add src/lib/securityHeaders.ts src/lib/securityHeaders.test.ts src/lib/serverEnv.ts src/lib/serverEnv.test.ts src/instrumentation.ts test/no-raw-html.test.ts next.config.ts
git commit -m "feat: security headers, CSP and server env check"
```

---

### Task 6: Auth core: Supabase server client, auth state, gate on the dashboard

**Files:**
- Create: `src/auth/state.ts`, `src/auth/supabase.ts`, `src/auth/session.ts`
- Modify: `src/app/page.tsx`, `supabase/config.toml`, `.env.example`, `test/env-example.test.ts`, `package.json`
- Test: `src/auth/state.test.ts`, `src/auth/session.test.ts`

**Interfaces:**
- Produces, from `state.ts` (pure):

```ts
export interface SessionClaims { sub: string; aal?: string; user_metadata?: { must_change_password?: boolean } }
export type AuthStatus = 'anonymous' | 'needs-mfa-enrolment' | 'needs-mfa-verification' | 'needs-password-change' | 'ok';
export type AuthState = { status: 'anonymous' } | { status: Exclude<AuthStatus, 'anonymous'>; userId: string };
export function resolveAuthState(claims: SessionClaims | null, nextLevel: 'aal1' | 'aal2' | null): AuthState;
export function statusPath(status: AuthStatus): string; // anonymous→/login, mfa→/mfa, password→/account/password, ok→/
```

- Produces, from `supabase.ts`: `createSupabaseServerClient(): Promise<SupabaseClient | null>`. It returns `null` when `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is unset. It uses the `@supabase/ssr` `createServerClient` `getAll`/`setAll` cookie pattern over `cookies()`, with `setAll` wrapped in try/catch because Server Components can't set cookies. It sets `cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }`.
- Produces, from `session.ts`:
  - `getAuthState(): Promise<AuthState>`. It calls `auth.getClaims()`; an error or no claims means anonymous. For AAL1 it calls `auth.mfa.getAuthenticatorAssuranceLevel()` to get `nextLevel`.
  - `requireAuthState(allowed: AuthStatus[]): Promise<AuthState>`. If the status isn't allowed, it calls `redirect(statusPath(status))`.
  - `requireAal2()`, which is `requireAuthState(['ok'])`.

- [ ] **Step 1: Install**

Run: `npm install @supabase/ssr@^0.12.7 @supabase/supabase-js@^2.118.0`, then `npm audit`.
Expected: 0 vulnerabilities.

- [ ] **Step 2: Write the failing tests**

```ts
// state.test.ts
it('treats no claims as anonymous', () => expect(resolveAuthState(null, null)).toEqual({ status: 'anonymous' }));
it('sends AAL1 users without a factor to enrolment', () =>
  expect(resolveAuthState({ sub: 'u1', aal: 'aal1' }, 'aal1')).toEqual({ status: 'needs-mfa-enrolment', userId: 'u1' }));
it('sends AAL1 users with a factor to verification', () =>
  expect(resolveAuthState({ sub: 'u1', aal: 'aal1' }, 'aal2')).toEqual({ status: 'needs-mfa-verification', userId: 'u1' }));
it('requires a password change after MFA when flagged', () =>
  expect(resolveAuthState({ sub: 'u1', aal: 'aal2', user_metadata: { must_change_password: true } }, 'aal2').status).toBe('needs-password-change'));
it('is ok at AAL2 without the flag', () => expect(resolveAuthState({ sub: 'u1', aal: 'aal2' }, 'aal2').status).toBe('ok'));
it('maps statuses to pages', () => {
  expect(statusPath('anonymous')).toBe('/login');
  expect(statusPath('needs-mfa-enrolment')).toBe('/mfa');
  expect(statusPath('needs-mfa-verification')).toBe('/mfa');
  expect(statusPath('needs-password-change')).toBe('/account/password');
  expect(statusPath('ok')).toBe('/');
});
// session.test.ts — vi.mock('@/auth/supabase') and vi.mock('next/navigation') (redirect throws Error(`REDIRECT ${path}`))
it('is anonymous when Supabase is not configured', async () => { /* createSupabaseServerClient → null */ expect(await getAuthState()).toEqual({ status: 'anonymous' }); });
it('is anonymous when getClaims fails', async () => { /* getClaims → { data: null, error: new Error('bad jwt') } */ });
it('redirects a disallowed status to its page', async () => { /* AAL1 + nextLevel aal2 */ await expect(requireAal2()).rejects.toThrow('REDIRECT /mfa'); });
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run src/auth`
Expected: FAIL. The modules are missing.

- [ ] **Step 4: Implement**
  - The three modules.
  - In `src/app/page.tsx` `Feed`: `await requireAal2()` right after `await connection()`, before `getDb()`.
  - `supabase/config.toml`:
    - `[auth]`: `site_url = "http://localhost:3000"`, `additional_redirect_urls = []`, `enable_signup = false`, `minimum_password_length = 12`.
    - `[auth.email]`: `enable_signup = false`.
    - `[auth.mfa.totp]`: `enroll_enabled = true`, `verify_enabled = true`.
  - `.env.example`: add `SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_PUBLISHABLE_KEY=`, `SUPABASE_SECRET_KEY=`, `IMPRINT_NAME=`, `IMPRINT_STREET=`, `IMPRINT_POSTAL_CITY=`, `IMPRINT_EMAIL=`.
  - `test/env-example.test.ts`: assert that `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and all four `IMPRINT_*` values are empty.

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: pass. The build may report the dashboard as dynamic behind Suspense; it must not fail.

Run locally:
1. `npx supabase stop`
2. `npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`
3. `npx supabase status`, and copy the publishable key and secret key into `.env.local` yourself. Don't print them in logs or commits.
4. Run `npm run dev` and open `http://localhost:3000`.

Expected: the page redirects to `/login`. A 404 is fine until Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/auth src/app/page.tsx supabase/config.toml .env.example test/env-example.test.ts package.json package-lock.json
git commit -m "feat: supabase auth state and AAL2 gate on the dashboard"
```

---

### Task 7: Proxy: session refresh and fast redirects

**Files:**
- Create: `src/auth/paths.ts`, `src/auth/proxySession.ts`, `src/proxy.ts`
- Test: `src/auth/paths.test.ts`

**Interfaces:**
- Consumes: `SessionClaims` (Task 6).
- Produces:
  - `PUBLIC_PATHS = ['/login', '/impressum', '/datenschutz', '/robots.txt']`
  - `proxyDecision(pathname: string, claims: SessionClaims | null): { action: 'next' } | { action: 'redirect'; to: string } | { action: 'unauthorized' }`
  - `updateSession(request: NextRequest): Promise<{ response: NextResponse; claims: SessionClaims | null }>`. This is the `@supabase/ssr` request/response cookie pattern. It calls `getClaims()`, which also refreshes expired tokens, and copies refreshed cookies onto the response. Any error means `claims: null`.

`proxyDecision` rules, in order:
1. A public path → next.
2. A path under `/api/` without AAL2 claims → unauthorized.
3. No claims → redirect `/login`.
4. `aal !== 'aal2'` → redirect `/mfa`, unless the path is `/mfa`.
5. AAL2 with `must_change_password` → redirect `/account/password`, unless it is that path.
6. Otherwise → next.

- [ ] **Step 1: Write the failing tests**

```ts
const aal1 = { sub: 'u', aal: 'aal1' }, aal2 = { sub: 'u', aal: 'aal2' };
it.each([
  ['/impressum', null, { action: 'next' }],
  ['/login', aal2, { action: 'next' }],
  ['/', null, { action: 'redirect', to: '/login' }],
  ['/?tab=sealed', null, { action: 'redirect', to: '/login' }],
  ['/mfa', null, { action: 'redirect', to: '/login' }],
  ['/mfa', aal1, { action: 'next' }],
  ['/', aal1, { action: 'redirect', to: '/mfa' }],
  ['/account/password', aal1, { action: 'redirect', to: '/mfa' }],
  ['/', { ...aal2, user_metadata: { must_change_password: true } }, { action: 'redirect', to: '/account/password' }],
  ['/account/password', { ...aal2, user_metadata: { must_change_password: true } }, { action: 'next' }],
  ['/api/card-image', null, { action: 'unauthorized' }],
  ['/api/card-image', aal1, { action: 'unauthorized' }],
  ['/api/card-image', aal2, { action: 'next' }],
  ['/', aal2, { action: 'next' }],
  ['/impressum/../', null, { action: 'redirect', to: '/login' }],
])('%s', (path, claims, expected) => expect(proxyDecision(path, claims as never)).toEqual(expected));
```

The pathname reaching `proxyDecision` is `request.nextUrl.pathname` (already normalized). Public paths match exactly, or with a trailing slash; they are not prefixes.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/auth/paths.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - `paths.ts` and `proxySession.ts`.
  - `src/proxy.ts`: `export async function proxy(request: NextRequest)`.
    - Call `updateSession` and then `proxyDecision(request.nextUrl.pathname, claims)`.
    - Redirect → a `NextResponse.redirect` carrying the refreshed cookies.
    - Unauthorized → `new NextResponse(null, { status: 401 })`.
    - Next → the `updateSession` response.
    - `config.matcher`: `['/((?!_next/static|_next/image|favicon.ico).*)']`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: pass. The build output lists `Proxy`.

Run: `npm run dev`, then `curl -sI http://localhost:3000/`.
Expected: `307` to `/login`. Also `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/card-image` should print `401`.

- [ ] **Step 5: Commit**

```bash
git add src/auth/paths.ts src/auth/paths.test.ts src/auth/proxySession.ts src/proxy.ts
git commit -m "feat: proxy refreshes sessions and redirects by auth level"
```

---

### Task 8: Login, sign-out and the owner's user script

**Files:**
- Create:
  - `src/auth/actions.ts`
  - `src/app/login/page.tsx`
  - `src/components/LoginForm.tsx` (client)
  - `src/components/SignOutButton.tsx`
  - `scripts/user.ts`
  - `src/auth/password.ts`
- Modify: `src/components/TopBar.tsx`, `src/components/TopBar.test.tsx`, `package.json`
- Test: `src/auth/actions.test.ts`, `src/auth/password.test.ts`, `src/components/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient`, `getAuthState`, `statusPath` (Task 6).
- Produces:
  - `type FormState = { error?: string }`
  - `signIn(prev: FormState, form: FormData): Promise<FormState>`. On success it redirects with `redirect('/mfa')`.
  - `signOut(): Promise<void>`. It calls `auth.signOut({ scope: 'local' })` and then `redirect('/login')`.
  - `generateStartingPassword(): string`, which is `randomBytes(18).toString('base64url')` (24 characters).
  - `passwordSchema = z.string().min(12).max(72)`.
  - npm scripts `user` = `tsx --env-file-if-exists=.env.local scripts/user.ts` and `user:prod` = `tsx --env-file=.env.supabase scripts/user.ts`.

Error copy, exact:

| Case | Message |
|---|---|
| Wrong or unknown credentials (identical for both) | `Email or password is wrong.` |
| Supabase status 429 | `Too many attempts. Wait a few minutes and try again.` |
| Client is `null` (not configured) | `Login is not available right now.` |
| Invalid email format | `Enter a valid email address.` |

The login page:
- shows "Forgot your password? Ask the owner for a new starting password." under the form
- is Aurora-styled: a panel with the wordmark, labelled inputs, and a gold CTA button "Log in"
- uses `autocomplete="username"` / `"current-password"` on the inputs
- redirects already logged-in users with `requireAuthState(['anonymous'])`, inside Suspense

- [ ] **Step 1: Write the failing tests**

```ts
// actions.test.ts — vi.mock('@/auth/supabase'), vi.mock('next/navigation') (redirect throws Error(`REDIRECT ${p}`))
const form = (email: string, password: string) => { const f = new FormData(); f.set('email', email); f.set('password', password); return f; };
it('normalizes the email before signing in', async () => {
  await expect(signIn({}, form(' Friend@Example.COM ', 'x'.repeat(12)))).rejects.toThrow('REDIRECT /mfa');
  expect(signInWithPassword).toHaveBeenCalledWith({ email: 'friend@example.com', password: 'x'.repeat(12) });
});
it('gives one message for wrong password and unknown email', async () => {
  // signInWithPassword → { error: { status: 400, code: 'invalid_credentials' } }
  expect(await signIn({}, form('a@b.de', 'wrong-password'))).toEqual({ error: 'Email or password is wrong.' });
});
it('reports rate limits', async () => { /* error.status 429 */ expect((await signIn({}, form('a@b.de', 'x'.repeat(12)))).error).toBe('Too many attempts. Wait a few minutes and try again.'); });
it('fails closed without configuration', async () => { /* client null */ expect((await signIn({}, form('a@b.de', 'x'.repeat(12)))).error).toBe('Login is not available right now.'); });
it('signs out locally and goes to login', async () => {
  await expect(signOut()).rejects.toThrow('REDIRECT /login');
  expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
});
it('redirects a stale sign-out without a session to login', async () => { /* client null */ await expect(signOut()).rejects.toThrow('REDIRECT /login'); });
// password.test.ts
it('makes 24-char url-safe starting passwords', () => {
  const a = generateStartingPassword(), b = generateStartingPassword();
  expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/); expect(a).not.toBe(b);
});
it('limits password length to 12–72', () => {
  expect(passwordSchema.safeParse('x'.repeat(11)).success).toBe(false);
  expect(passwordSchema.safeParse('x'.repeat(12)).success).toBe(true);
  expect(passwordSchema.safeParse('x'.repeat(73)).success).toBe(false);
});
// LoginForm.test.tsx (jsdom; pass a fake action prop): labelled "Email" and "Password" inputs with the autocomplete values; shows state.error in role="alert"
```

Update `TopBar.test.tsx` to `vi.mock('@/auth/actions')` and assert a "Sign out" button.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/auth src/components/LoginForm.test.tsx src/components/TopBar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - The actions, the login page, `LoginForm` (`useActionState(signIn, {})`), and `SignOutButton`, a `<form action={signOut}>` with a 44 px button "Sign out" placed in `TopBar`.
  - `scripts/user.ts`:
    - Usage: `npm run user[:prod] -- add <email>` or `-- reset <email>`.
    - It reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` and creates the client with `{ auth: { persistSession: false, autoRefreshToken: false } }`.
    - `add`: `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { must_change_password: true } })`.
    - `reset`: find the user by email via `auth.admin.listUsers` (paged), then `updateUserById(id, { password, user_metadata: { must_change_password: true } })`.
    - Print `Starting password for <email>: <password>` once. Exit 1 with a short message on any error. Never print the secret key.

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run typecheck`
Expected: pass.

Then, locally:
1. Create a test user: `npm run user -- add test@example.com`.
2. Log in at `/login` with it.

Expected: you land on `/mfa`, which is a 404 until Task 9. A wrong password shows the generic message.

- [ ] **Step 5: Commit**

```bash
git add src/auth/actions.ts src/auth/actions.test.ts src/auth/password.ts src/auth/password.test.ts src/app/login src/components/LoginForm.tsx src/components/LoginForm.test.tsx src/components/SignOutButton.tsx src/components/TopBar.tsx src/components/TopBar.test.tsx scripts/user.ts package.json
git commit -m "feat: password login, sign-out and owner user script"
```

---

### Task 9: MFA enrolment and verification, password change

**Files:**
- Modify: `src/auth/actions.ts`, `src/auth/actions.test.ts`
- Create:
  - `src/app/mfa/page.tsx`
  - `src/components/MfaForm.tsx` (client)
  - `src/app/account/password/page.tsx`
  - `src/components/PasswordForm.tsx` (client)
- Test: `src/components/MfaForm.test.tsx`, `src/components/PasswordForm.test.tsx`

**Interfaces:**
- Consumes: `FormState`, `passwordSchema`, `requireAuthState`, `getAuthState`, `statusPath`.
- Produces:
  - `startEnrolment(): Promise<{ factorId: string; qrCode: string; secret: string } | { error: string }>`. It requires status `needs-mfa-enrolment`. It unenrolls every TOTP factor with `status === 'unverified'` (from `mfa.listFactors()`), then calls `mfa.enroll({ factorType: 'totp' })`.
  - `verifyMfa(prev: FormState, form: FormData): Promise<FormState>`. Fields: `code`, which must match `/^\d{6}$/`, and optional `factorId`. Without a `factorId` it uses the first verified TOTP factor. It calls `mfa.challengeAndVerify({ factorId, code })`, then `refreshSession()`, then `redirect(statusPath(new status))`.
  - `changePassword(prev: FormState, form: FormData): Promise<FormState>`. Fields: `password`, `confirm`. It requires `needs-password-change` or `ok`, then calls `auth.updateUser({ password, data: { must_change_password: false } })`, then `refreshSession()`, then `redirect('/')`.

Copy:

| Where | Text |
|---|---|
| Wrong code | `That code didn't work. Check the time on your phone and try again.` |
| Code format | `Enter the 6-digit code from your authenticator app.` |
| Password too short or long | `Use 12 to 72 characters.` |
| Passwords differ | `The passwords don't match.` |
| Same password (Supabase `same_password`) | `Choose a password different from the starting one.` |
| Enrolment intro | "Scan this QR code with an authenticator app (for example Aegis, 2FAS, Google Authenticator or 1Password), then enter the 6-digit code." |

The enrolment intro also shows the `secret` as text, for manual entry. The QR code is an `<img alt="QR code for your authenticator app">` with `src={qrCode}`, which is a `data:` URI; the CSP allows it. Both pages include `SignOutButton`.

- [ ] **Step 1: Write the failing tests**

```ts
// actions.test.ts additions
it('removes leftover unverified factors before enrolling', async () => {
  // state needs-mfa-enrolment; listFactors → { data: { totp: [{ id: 'old', status: 'unverified' }] } }
  await startEnrolment();
  expect(unenroll).toHaveBeenCalledWith({ factorId: 'old' });
  expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' });
});
it('refuses enrolment for users who already have a factor', async () => { /* state needs-mfa-verification */ await expect(startEnrolment()).rejects.toThrow('REDIRECT /mfa'); });
it('rejects malformed codes without calling Supabase', async () => {
  expect(await verifyMfa({}, fd({ code: '12a456' }))).toEqual({ error: 'Enter the 6-digit code from your authenticator app.' });
  expect(challengeAndVerify).not.toHaveBeenCalled();
});
it('goes to the password page after MFA when a change is required', async () => { /* after verify, claims aal2 + must_change_password */ await expect(verifyMfa({}, fd({ code: '123456' }))).rejects.toThrow('REDIRECT /account/password'); });
it('validates the new password', async () => {
  expect(await changePassword({}, fd({ password: 'short', confirm: 'short' }))).toEqual({ error: 'Use 12 to 72 characters.' });
  expect(await changePassword({}, fd({ password: 'a'.repeat(12), confirm: 'b'.repeat(12) }))).toEqual({ error: "The passwords don't match." });
});
it('clears the change flag and goes home', async () => {
  await expect(changePassword({}, fd({ password: 'a'.repeat(12), confirm: 'a'.repeat(12) }))).rejects.toThrow('REDIRECT /');
  expect(updateUser).toHaveBeenCalledWith({ password: 'a'.repeat(12), data: { must_change_password: false } });
});
// MfaForm.test.tsx: enrolment mode shows the QR img alt, the secret, and a labelled "6-digit code" input
//   (inputMode="numeric", autocomplete="one-time-code"); verification mode shows only the code input.
// PasswordForm.test.tsx: labelled "New password" / "Repeat new password", autocomplete="new-password".
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/auth src/components/MfaForm.test.tsx src/components/PasswordForm.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the actions, pages and forms**
  - `/mfa` page: inside Suspense, `requireAuthState(['needs-mfa-enrolment', 'needs-mfa-verification'])`, then render `MfaForm` in the matching mode. In enrolment mode, the form calls `startEnrolment` from a "Set up authenticator" button. A GET render never enrols.
  - `/account/password`: `requireAuthState(['needs-password-change', 'ok'])`.

- [ ] **Step 4: Verify end to end locally**

Run: `npm test && npm run lint && npm run typecheck`
Expected: pass.

Then:
1. Log in with the test user from Task 8.
2. Enrol with a real authenticator app.
3. Change the password.

Expected: you land on the dashboard.

Then:
1. Sign out.
2. Log in again.

Expected: you're asked only for the code, then you see the dashboard.

Then:
1. Run `npm run user -- reset test@example.com`.
2. Log in with the new starting password.

Expected: code, then the password page.

- [ ] **Step 5: Commit**

```bash
git add src/auth/actions.ts src/auth/actions.test.ts src/app/mfa src/app/account src/components/MfaForm.tsx src/components/MfaForm.test.tsx src/components/PasswordForm.tsx src/components/PasswordForm.test.tsx
git commit -m "feat: TOTP enrolment and verification, forced password change"
```

---

### Task 10: Image proxy

**Files:**
- Create: `src/lib/imageProxy.ts`, `src/app/api/card-image/route.ts`
- Modify: `src/providers/cardtrader/normalize.ts` (stricter `safeCardTraderImageUrl`), `src/components/CardImage.tsx`, `src/components/CardImage.test.tsx`
- Test: `src/lib/imageProxy.test.ts`, the existing normalize tests

**Interfaces:**
- Consumes: `getAuthState` (Task 6), `safeCardTraderImageUrl`.
- Produces:
  - `MAX_IMAGE_BYTES = 2 * 1024 * 1024`
  - `ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']`
  - `fetchCardImage(src: string, fetchFn: typeof fetch): Promise<{ ok: true; body: Uint8Array; contentType: string } | { ok: false; status: 400 | 502 }>`
  - `proxiedImageSrc(src: string): string`, which returns `/api/card-image?src=${encodeURIComponent(src)}`. It is exported from `CardImage.tsx`.

`safeCardTraderImageUrl` additionally requires an empty `username`, `password` and `port`.

`fetchCardImage`:
- An invalid `src` returns 400, without fetching.
- Fetch with `redirect: 'manual'`, `signal: AbortSignal.timeout(10_000)` and `credentials: 'omit'`.
- Follow at most 3 `3xx` responses. Resolve each `Location` against the current URL and re-check it with `safeCardTraderImageUrl`. A failed check returns 502.
- The final status must be 200. The content type (the part before `;`, lower-cased) must be in `ALLOWED_IMAGE_TYPES`.
- Reject a `Content-Length` over the cap. Otherwise read the stream, counting bytes, and cancel the stream past `MAX_IMAGE_BYTES`, returning 502.

The route:
- Status not `ok` → 401, empty body.
- Otherwise call `fetchCardImage(searchParams.get('src') ?? '', fetch)`.
- Success → 200 with `Content-Type`, `Cache-Control: private, max-age=86400` and `X-Content-Type-Options: nosniff`.
- Failure → the status with an empty body.
- Never log the URL.

- [ ] **Step 1: Write the failing tests**

```ts
const jpeg = (init: ResponseInit = {}) => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' }, ...init });
it.each([
  'https://cardtrader.com.evil.example/x.jpg', 'http://cardtrader.com/x.jpg',
  'https://user:pw@cardtrader.com/x.jpg', 'https://cardtrader.com:8443/x.jpg', 'not a url', '',
])('refuses %s without fetching', async (src) => {
  const f = vi.fn();
  expect(await fetchCardImage(src, f)).toEqual({ ok: false, status: 400 });
  expect(f).not.toHaveBeenCalled();
});
it('follows a redirect to www.cardtrader.com', async () => { /* 301 Location https://www.cardtrader.com/x.jpg → jpeg() ⇒ ok, contentType 'image/jpeg', body length 3 */ });
it('refuses a redirect to another host', async () => { /* 302 Location https://evil.example/x.jpg ⇒ { ok: false, status: 502 }, fetch called once */ });
it('stops after 3 redirects', async () => { /* always 302 to cardtrader ⇒ 502, fetch called 4 times */ });
it('refuses SVG', async () => { /* content-type image/svg+xml ⇒ 502 */ });
it('refuses bodies over 2 MB even without Content-Length', async () => { /* stream of 2*1024*1024+1 bytes, no content-length ⇒ 502 */ });
it('refuses a declared Content-Length over 2 MB', async () => { /* header 3000000 ⇒ 502 */ });
// CardImage.test.tsx: img src === '/api/card-image?src=' + encodeURIComponent(url)
// normalize tests: user:pw@ and :8443 URLs → null
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/imageProxy.test.ts src/components/CardImage.test.tsx src/providers/cardtrader`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write the module and the route, then switch `CardImage` to `proxiedImageSrc(src)` and keep its fallback behaviour.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: pass.

Run locally, logged in at AAL2: open the dashboard. Pictures should load, and the browser devtools Network tab should show only `localhost` requests, no cardtrader.com. Also run `curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/card-image?src=x"` without cookies; it should print `401`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imageProxy.ts src/lib/imageProxy.test.ts src/app/api/card-image/route.ts src/providers/cardtrader/normalize.ts src/providers/cardtrader/*.test.ts src/components/CardImage.tsx src/components/CardImage.test.tsx
git commit -m "feat: auth-gated CardTrader image proxy"
```

---

### Task 11: Impressum, Datenschutz, footer, robots

**Files:**
- Create:
  - `src/config/imprint.ts`
  - `src/app/impressum/page.tsx`
  - `src/app/datenschutz/page.tsx`
  - `src/components/SiteFooter.tsx`
  - `src/app/robots.ts`
- Modify: `src/app/layout.tsx` (render `SiteFooter` after `children`; `metadata.robots = { index: false, follow: false }`)
- Test: `src/config/imprint.test.ts`, `src/components/SiteFooter.test.tsx`, `src/app/legal.test.tsx`

**Interfaces:**
- Produces:
  - `interface Imprint { name: string; street: string; postalCity: string; email: string }`
  - `IMPRINT_PLACEHOLDER = '[nicht konfiguriert]'`
  - `getImprint(env: Record<string, string | undefined> = process.env): Imprint`. It trims values and uses the placeholder for missing or blank ones.

Required content, German, in a readable Aurora prose panel, with `<main lang="de">` and `metadata.title` "Impressum · pokedash" / "Datenschutz · pokedash". Both pages are synchronous server components that read no request data.

**`/impressum`**
- Heading "Impressum".
- "Angaben gemäß § 5 DDG": name, street, postal code and city, then "Kontakt: E-Mail: <email>" as a `mailto:` link.
- "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV": name and address.
- A one-line note that this is a private, non-commercial project for a small invited circle.

`/datenschutz` sections:
1. Verantwortlicher: the imprint values.
2. Überblick: the private service for invited users; no tracking, no analytics, no advertising.
3. Hosting (Vercel): server logs with IP addresses, for delivery and security, Art. 6 (1) (f) GDPR. Vercel Inc., USA: EU-US Data Privacy Framework, data processing agreement.
4. Datenbank und Anmeldung (Supabase): Frankfurt region. Email address (login name only; no emails are sent), password hash, authenticator factor, session data. Art. 6 (1) (b) GDPR. Data processing agreement.
5. Cookies: only the technically necessary login cookies, § 25 (2) No. 2 TDDDG, so no consent banner.
6. Kartenbilder: CardTrader pictures are loaded by the pokedash server; the browser makes no connection to CardTrader.
7. Schriftarten: fonts are delivered locally; no connection to Google.
8. Marktdaten: prices from Cardmarket, CardTrader and PokemonPriceTracker, and the ECB rate. No personal data of users; collected through GitHub Actions.
9. Speicherdauer: the account until deletion on request. Logs per the providers' own retention. Write this without inventing durations.
10. Rechte: Art. 15 to 21 GDPR, and the right to object.
11. Beschwerderecht: "Die Landesbeauftragte für den Datenschutz Niedersachsen", Prinzenstraße 5, 30159 Hannover.
12. Stand: Oktober 2026.

**`SiteFooter`:**
- "Impressum" links to `/impressum` and "Datenschutz" links to `/datenschutz`, in muted text, 44 px tap targets.
- It reads no request data, so the static shell keeps it.

`robots.ts`: `{ rules: { userAgent: '*', disallow: '/' } }`.

- [ ] **Step 1: Write the failing tests**

```ts
// imprint.test.ts
it('reads and trims the imprint from env', () =>
  expect(getImprint({ IMPRINT_NAME: ' Erika Muster ', IMPRINT_STREET: 'Beispielweg 1', IMPRINT_POSTAL_CITY: '12345 Musterstadt', IMPRINT_EMAIL: 'kontakt@example.org' }))
    .toEqual({ name: 'Erika Muster', street: 'Beispielweg 1', postalCity: '12345 Musterstadt', email: 'kontakt@example.org' }));
it('uses a placeholder for missing values', () => expect(getImprint({ IMPRINT_NAME: '  ' }).name).toBe('[nicht konfiguriert]'));
// SiteFooter.test.tsx: links named Impressum (href /impressum) and Datenschutz (href /datenschutz)
// legal.test.tsx (jsdom; vi.stubEnv the four IMPRINT_* with the fictional values above):
//   Impressum page shows heading "Impressum", "Erika Muster", "12345 Musterstadt", mailto:kontakt@example.org
//   Datenschutz page shows headings containing "Verantwortlicher", "Hosting", "Cookies", "Beschwerderecht" and the text "Landesbeauftragte für den Datenschutz Niedersachsen"
```

Tests use only the fictional values above, never the owner's details.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/config/imprint.test.ts src/components/SiteFooter.test.tsx src/app/legal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the pages, footer, robots and layout changes**

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: pass. `/impressum` and `/datenschutz` prerender as static. Their values are read at build time; a change on Vercel needs a redeploy (note this in the README, Task 12).

Run: `npm run dev`
Expected: without cookies, `/impressum` and `/datenschutz` render, and the footer shows on `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/config/imprint.ts src/config/imprint.test.ts src/app/impressum src/app/datenschutz src/app/robots.ts src/app/legal.test.tsx src/components/SiteFooter.tsx src/components/SiteFooter.test.tsx src/app/layout.tsx
git commit -m "feat: Impressum, Datenschutz, footer and noindex"
```

---

### Task 12: README and go-live runbook

**Files:**
- Modify: `README.md`, `docs/superpowers/notes/2026-10-19-slice-1-follow-ups.md` (mark run lock, `prepare: false` and npm audit as resolved, with this branch named)

**Interfaces:**
- Consumes: the script names, env var names and secret names from Tasks 2 to 11.

**README sections:**

1. Local setup.
   - Docker plus the new `supabase start -x …` command from Task 6.
   - The `.env.local` keys from `npx supabase status`.
   - `npm run user -- add you@example.com`.
   - First login with MFA.
2. How it runs online. Vercel, Supabase Frankfurt, GitHub Actions schedules, and the two DB roles.
3. Go-live runbook (owner + Claude), in order:
   1. Supabase:
      - Create the project (Free, Frankfurt).
      - Database settings: "Enforce SSL" on.
      - Settings → Data API: disable it.
      - Auth:
        - sign-ups off
        - email provider on with "Confirm email" irrelevant
        - minimum password length 12
        - TOTP MFA on
        - site URL = the Vercel URL
      - JWT signing keys: make sure asymmetric keys are active, so `getClaims` verifies locally.
   2. On the owner's PC, create `.env.supabase` with:
      - `DATABASE_URL`: postgres via the session pooler, port 5432, `?sslmode=require`
      - `SUPABASE_URL`
      - `SUPABASE_SECRET_KEY`

      Then run `npm run db:migrate:prod`.
   3. In the Supabase SQL editor:
      - `ALTER ROLE pokedash_app WITH PASSWORD '…'`
      - `ALTER ROLE pokedash_ingest WITH PASSWORD '…'`

      Generate the passwords in a password manager; never paste them into chats or commits.
   4. GitHub:
      - Secrets: `INGEST_DATABASE_URL` (`pokedash_ingest.<ref>`, session pooler 5432, `sslmode=require`), `CARDTRADER_TOKEN`, `POKEMONPRICETRACKER_API_KEY`.
      - Settings → Code security: Dependabot alerts on, secret scanning + push protection on. Code scanning runs from `codeql.yml`, so don't enable "default setup" as well.
   5. Vercel:
      - Import the repo.
      - Production env only: `DATABASE_URL` (`pokedash_app.<ref>`, transaction pooler 6543, `sslmode=require`), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the four `IMPRINT_*` values.
      - Preview gets none of these.
      - Deployment protection for previews stays on.
      - Redeploy after any `IMPRINT_*` change.
   6. Run the `ingest-daily` workflow once by hand.
   7. Run `npm run user:prod -- add <email>` for the owner, then for each friend. Hand over starting passwords privately. The owner enrols MFA on two devices.
4. Free-tier caveats.
   - GitHub pauses schedules after 60 days without repo activity; re-enable them in the Actions tab.
   - Supabase pauses after 7 idle days; the 30-minute ingest prevents that.
   - 500 MB database limit; the daily job alerts at 400 MB.
5. Lost authenticator. The owner removes the user's factor in Supabase (Auth → Users → user → MFA), and the user re-enrols. Forgotten password: `npm run user:prod -- reset <email>`.
6. Keep the existing sections on data sources, US prices and tests, updated where commands changed (`npm run ingest -- --listings|--daily`).

- [ ] **Step 1: Write the README and update the follow-ups note**

- [ ] **Step 2: Verify**

Run: `npm test && npm run lint && npm run typecheck && npm run build && npm audit`
Expected: all pass, and `found 0 vulnerabilities`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/notes/2026-10-19-slice-1-follow-ups.md
git commit -m "docs: online setup, go-live runbook and free-tier caveats"
```

---

## After the tasks: review and go-live (with the owner, not a subagent)

1. Run a whole-branch code review, then the `security-review` skill on `feat/online`. Fix the findings.
2. Push `feat/online` and open a PR only when the owner asks. CI must be green, including `npm audit --omit=dev --audit-level=high`.
3. Walk through the README runbook together with the owner. The owner types every secret and password into the provider dashboards themselves.
   - Order: Supabase project, migrations, role passwords, the auth retention SQL, GitHub secrets, then merge the PR into `main`, and only then the Vercel import.
   - Never import the repository into Vercel before the merge. Vercel deploys the production branch on import, and `main` without this branch has no login, no legal pages, no security headers and no `vercel.json`.
   - Set the Supabase Site URL to the production address before the first login.
4. Smoke-test production:
   - `curl -sI https://<app>.vercel.app/` → 307 to `/login`, with the security headers present.
   - `/impressum` shows the real values.
   - The first `ingest-daily` and `ingest-listings` runs are green, and their logs show counts only.
   - Log in with MFA on desktop and phone.
   - Card pictures load through `/api/card-image`.
5. Recommend once that the owner has the legal pages checked (eRecht24 or a lawyer).
