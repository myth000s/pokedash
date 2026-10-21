# pokedash

A private dashboard that finds underpriced Pokémon TCG listings. It loads Cardmarket's public price guide as the market value (sales-based fields only), pulls listings from CardTrader, and shows the ones priced well below market. The first tracked set is 30th Celebration.

Kleinanzeigen is intentionally not supported: its terms ban scrapers.

Contents: [Local setup](#local-setup) · [How it runs online](#how-it-runs-online) · [Go-live runbook](#go-live-runbook) · [Day to day](#day-to-day) · [Limits](#free-tier-limits-and-known-limits) · [Data sources and US prices](#data-sources-and-us-prices) · [Other commands](#other-commands)

## Local setup

You need Node 24, Docker Desktop (it runs the local Supabase) and a CardTrader API token from your CardTrader profile settings.

```bash
npm install
npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
cp -n .env.example .env.local   # only if you don't have one yet; -n never overwrites
npx supabase status              # shows the local URL and keys
```

The `-x` list switches off the Supabase parts pokedash does not use. Only the database, auth and the gateway (kong) run.

Copy `.env.example` only if you don't have a `.env.local` yet: it would replace your keys. Open `.env.local` in an editor and fill in the keys yourself (it is git-ignored; never paste its contents into a chat):

- `SUPABASE_URL`: the API URL from `npx supabase status`.
- `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: the publishable and secret keys from the same output.
- `CARDTRADER_TOKEN`: your CardTrader token.
- `POKEMONPRICETRACKER_API_KEY`: optional, see US prices below.
- `IMPRINT_NAME`, `IMPRINT_STREET`, `IMPRINT_POSTAL_CITY`, `IMPRINT_EMAIL`: the Impressum details. They can stay empty locally.

`DATABASE_URL` in `.env.example` already points at the local database. Never put a token in `.env.example`, which is committed; a test fails if the secret entries there are not empty.

Then:

```bash
npm run db:migrate
npm run user -- add you@example.com   # prints a starting password once
npm run ingest                        # Cardmarket values, then CardTrader listings
npm run dev                           # http://localhost:3000
```

First login: sign in with the starting password. The app asks you to set up an authenticator app (scan the QR code, then enter the 6-digit code), then to choose your own password (12 to 72 characters).

## How it runs online

- **Vercel** (Hobby, region fra1) serves the Next.js app. It only reads the database.
- **Supabase** (Free, Frankfurt) holds the Postgres database and the logins. Login is password plus a required authenticator code (TOTP). Nobody can sign up on their own: the owner creates accounts with a script. pokedash sends no emails.
- **GitHub Actions** fetches the data on a schedule: the `ingest-listings` workflow every 30 minutes, and the `ingest-daily` workflow once a day (Cardmarket values, US prices, cleanup and a database size check). Both share one run lock (a concurrency group), so they never overlap.
- **Two database roles.** `pokedash_app` is read-only; Vercel uses it through Supabase's transaction pooler (port 6543). `pokedash_ingest` can read and write; GitHub Actions uses it through the session pooler (port 5432). On Supabase the pooler user names carry a suffix: `pokedash_app.<project-ref>` and `pokedash_ingest.<project-ref>`.
- **Migrations** are run from the owner's PC as the `postgres` user, never by Vercel or GitHub.

## Go-live runbook

Do these steps in order. Do the dashboard steps yourself in each provider's website, and type every password and key in yourself. Never paste one into a chat, an issue or a commit.

### 1. Supabase project

1. Create a project: plan Free, region Frankfurt. Note the project reference (`<project-ref>`).
2. Database settings: turn "Enforce SSL" on.
3. Settings, Data API: disable it. pokedash never uses it.
4. Authentication settings:
   - "Allow new users to sign up": off.
   - Email provider: **leave it on.** Password login needs it, and turning it off breaks login. ("Confirm email" does not matter; accounts are created already confirmed.)
   - Minimum password length: 12.
   - Multi-factor authentication: enable TOTP.
   - Site URL: your Vercel address. You only know it in step 7; set it there, before anyone logs in for the first time.
5. JWT signing keys: make sure asymmetric signing keys are active, so the app can verify sessions locally.
6. In the dashboard's legal documents section, conclude the Supabase data processing agreement (DPA). The privacy page states that it exists. Vercel's DPA is part of its terms.

### 2. Your PC: `.env.supabase` and the migrations

Create a file named `.env.supabase` in the project folder with three lines:

```
DATABASE_URL=postgresql://postgres.<project-ref>:<postgres-password>@<pooler-host>:5432/postgres?sslmode=require
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<secret key from the Supabase API keys page>
```

`DATABASE_URL` uses the **session pooler** (port 5432) with the `postgres` user. Copy the exact connection string from the Supabase "Connect" dialog. The file is git-ignored (`.env*`) and Next.js never loads it; only `db:migrate:prod` and `user:prod` read it.

Then run:

```bash
npm run db:migrate:prod
```

Migrations must run as `postgres`, because the default privileges for the two roles are set for that user. When a later change needs a new migration, run it **before** merging the code that needs it.

### 3. Role passwords

In the Supabase SQL editor run, once each:

```sql
ALTER ROLE pokedash_app WITH PASSWORD '<generated password>';
ALTER ROLE pokedash_ingest WITH PASSWORD '<generated password>';
```

Generate both passwords in a password manager and keep them there. Use letters and digits only, or URL-encode special characters when they go into a connection string.

### 4. Retention of login data

Supabase Auth keeps login audit entries (with the IP address) and sessions (with IP address and browser) until someone deletes them. Open `supabase/maintenance/auth-retention.sql` from this repository, paste it into the Supabase SQL editor and run it once (the editor runs as `postgres`). It switches on the pg_cron extension and schedules a daily job at 03:15 UTC that:

- deletes Auth audit-log entries older than 30 days, and
- deletes sessions with no activity for 30 days (their refresh tokens go with them, so that browser has to log in again).

The privacy page promises exactly these 30 days, so do not skip this step. Running the file again is safe; it replaces the job. To check it: `select jobname, schedule, active from cron.job;` shows `pokedash-auth-retention`, and after the first night `cron.job_run_details` shows its runs as `succeeded`.

### 5. GitHub

1. Settings, Secrets and variables, Actions: add these repository secrets:
   - `INGEST_DATABASE_URL`: `postgresql://pokedash_ingest.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require` (session pooler, port 5432).
   - `CARDTRADER_TOKEN`
   - `POKEMONPRICETRACKER_API_KEY`
2. Settings, Code security: turn on Dependabot alerts, and secret scanning with push protection.
3. Code scanning already runs from `.github/workflows/codeql.yml`. Do **not** also enable CodeQL "default setup".

### 6. Merge into main

Merge the pull request for `feat/online` into `main` once its CI checks are green.

**Never import the repository into Vercel before this merge.** Vercel deploys the production branch (`main`) as soon as you import it, and `main` without this merge has no login, no Impressum or Datenschutz, no security headers and no `vercel.json`: the deal feed would be public.

### 7. Vercel

1. Import the GitHub repository. Set the region to fra1 if it is not already (`vercel.json` asks for fra1). Add the variables from point 2 in the import screen before the first deploy; if you add them later, redeploy afterwards.
2. Add these environment variables for **Production only**:
   - `DATABASE_URL`: `postgresql://pokedash_app.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require` (transaction pooler, port 6543).
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `IMPRINT_NAME`, `IMPRINT_STREET`, `IMPRINT_POSTAL_CITY`, `IMPRINT_EMAIL`: the real details for the Impressum.
3. **Never** set `SUPABASE_SECRET_KEY` on Vercel. Only your own PC needs it.
4. Preview deployments get none of these variables. Leave Vercel's deployment protection on so previews stay private.
5. The `IMPRINT_*` values are read when the site is built. After changing any of them, redeploy on Vercel.
6. Copy the production address into the Supabase Site URL (step 1.4) now, before anyone logs in for the first time.

### 8. First data

In GitHub open the Actions tab, choose `Ingest daily` and press "Run workflow". It must finish green; its log shows counts only. After that, `Ingest listings` runs by itself every 30 minutes (you can also start it by hand).

### 9. Users

For yourself, and then for each friend:

```bash
npm run user:prod -- add <email>
```

It prints a starting password once. Hand it over privately, not in a group chat. On the first login the person enters it, sets up an authenticator app (scan the QR code, type the code), then chooses their own password (12 to 72 characters).

Set up your own authenticator on **two devices** (for example phone and tablet), so losing one does not lock you out.

### 10. Check that it works

- Opening the site without being logged in sends you to `/login`.
- `/impressum` and `/datenschutz` show your real details.
- You can log in with password and code, on desktop and on your phone.
- Card pictures load.
- The first `Ingest daily` and `Ingest listings` runs are green.

### 11. Legal pages

Have the Impressum and Datenschutz pages checked by a German legal-text service (for example eRecht24) or a lawyer. They are a starting point, not legal advice.

## Day to day

- **Add a user:** `npm run user:prod -- add <email>`.
- **Forgotten password:** `npm run user:prod -- reset <email>`. It prints a new starting password once, and the person must choose a new one at the next login. If the account may be compromised, also end that user's active sessions in the Supabase dashboard (Auth, Users).
- **Lost authenticator:** in the Supabase dashboard open Auth, Users, pick the user and remove their MFA factor. At the next login they set up a new authenticator.
- **Change the Impressum:** edit the `IMPRINT_*` variables on Vercel, then redeploy.

## Free-tier limits and known limits

- **Login limits are shared.** Supabase's rate limits for sign-in and code checks count the server's address, not the visitor's. Many failed attempts by anyone can briefly block logins for everyone.
- **GitHub pauses scheduled workflows** after 60 days without repository activity. If the data goes stale, open the Actions tab and re-enable them.
- **Supabase Free pauses a project after 7 idle days.** The 30-minute ingest prevents that.
- **500 MB database limit.** The daily job alerts at 400 MB: it logs a warning and the run turns red. Shorten the retention then.
- **A daily run can be skipped silently.** Both ingest workflows share one concurrency group, and GitHub may drop a pending scheduled run when another one queues behind it in the same group. So a daily run can occasionally be skipped without an error; the next day's run catches up.

## Data sources and US prices

Market values come from Cardmarket's public price guide, listings from CardTrader.

Run `npm run ingest` whenever you want fresh data locally. Without `CARDTRADER_TOKEN` it loads Cardmarket values only and skips CardTrader. The online workflows use the two parts separately:

```bash
npm run ingest -- --listings   # CardTrader listings only (the 30-minute job)
npm run ingest -- --daily      # Cardmarket values, US prices, cleanup and size check (the daily job)
```

Unlike the local run, these two fail (exit code 1, a red workflow) when a key they need is missing: `--listings` needs `CARDTRADER_TOKEN`, and `--daily` needs it and `POKEMONPRICETRACKER_API_KEY`. The log names the missing secret, never a value. The rest of the run still goes ahead.

**US reference prices.** Get a free key at pokemonpricetracker.com and put it in `.env.local` as `POKEMONPRICETRACKER_API_KEY` (online: the GitHub secret of the same name). The ingest then fetches US English reference prices for sealed products and singles worth €5+, at most once per product per day. That uses about 87 of the free tier's 100 credits/day, and it stops early when credits run low. Without the key it skips US prices.

## Other commands

```bash
npm test                  # unit and end-to-end tests, in-memory database, no network
npm run lint
npm run typecheck
npm run build
npm run cardtrader:smoke  # checks the CardTrader token and how listings normalize
```
