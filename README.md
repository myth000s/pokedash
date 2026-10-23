# pokedash

A private dashboard that finds underpriced Pokémon TCG listings. It pulls listings from CardTrader, works out a market value for each product from the current EN/DE offers there, and shows the listings priced well below it. Cardmarket's public price guide appears only as an "all languages" note. It tracks 30th Celebration and 15 WOTC sets.

Kleinanzeigen is not supported on purpose: its terms ban scrapers.

Contents: [Local setup](#local-setup) · [How it runs online](#how-it-runs-online) · [Go-live runbook](#go-live-runbook) · [Day to day](#day-to-day) · [Limits](#free-tier-limits-and-known-limits) · [Data sources and US prices](#data-sources-and-us-prices) · [Other commands](#other-commands)

## Local setup

You need Node 24, Docker Desktop (it runs the local Supabase) and a CardTrader API token from your CardTrader profile settings.

```bash
npm install
npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
cp -n .env.example .env.local   # only if you don't have one yet; -n never overwrites
npx supabase status              # shows the local URL and keys
```

The `-x` list switches off the Supabase parts pokedash doesn't use, so only the database, auth and the gateway (kong) run.

Open `.env.local` in an editor and fill in the keys yourself. The file is git-ignored; never paste its contents into a chat.

- `SUPABASE_URL`: the API URL from `npx supabase status`.
- `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: the publishable and secret keys from the same output.
- `CARDTRADER_TOKEN`: your CardTrader token.
- `POKEMONPRICETRACKER_API_KEY`: optional, see US prices below.
- `IMPRINT_NAME`, `IMPRINT_STREET`, `IMPRINT_POSTAL_CITY`, `IMPRINT_EMAIL`: the Impressum details. They can stay empty locally.

`DATABASE_URL` in `.env.example` already points at the local database. Never put a token in `.env.example`: the file is committed, and a test fails if its secret entries aren't empty.

Then:

```bash
npm run db:migrate
npm run user -- add you@example.com   # prints a starting password once
npm run ingest                        # Cardmarket values, then CardTrader listings
npm run dev                           # http://localhost:3000
```

On the first login you sign in with the starting password, set up an authenticator app (scan the QR code, enter the 6-digit code) and then choose your own password (12 to 72 characters).

## How it runs online

| Part | Service | What it does |
|---|---|---|
| Website | Vercel (Hobby, region fra1) | Serves the Next.js app. It only reads the database. |
| Database and logins | Supabase (Free, Ireland, eu-west-1) | Holds the Postgres database and the accounts. You log in with a password plus a code from an authenticator app (TOTP). |
| Data updates | GitHub Actions | `ingest-listings` runs every 30 minutes and its CardTrader listings are the basis of the market values; `ingest-daily` runs once a day (Cardmarket catalogue and price guide notes, US prices and exchange rate, cleanup and a database size check). They share a concurrency group, so they never run at the same time. |

Nobody can sign up on their own: the owner creates accounts with a script, and pokedash sends no emails.

The database has two roles:

| Role | Rights | Used by | Connection |
|---|---|---|---|
| `pokedash_app` | read only | Vercel | transaction pooler, port 6543 |
| `pokedash_ingest` | read and write | GitHub Actions | session pooler, port 5432 |

On Supabase the pooler user names carry a suffix: `pokedash_app.<project-ref>` and `pokedash_ingest.<project-ref>`. Migrations run from the owner's PC as the `postgres` user, never from Vercel or GitHub.

## Go-live runbook

Do these steps in order. You click through each provider's website yourself and type every password and key yourself. Never paste one into a chat, an issue or a commit. The menu names in the dashboards can differ slightly from the ones below.

### 1. Supabase project

1. Create a project on the Free plan in an EU region (pokedash uses Ireland, eu-west-1). Note the project reference (`<project-ref>`).
2. Database settings: turn on "Enforce SSL".
3. Settings, Data API: turn it off. pokedash never uses it.
4. Authentication settings:
   - "Allow new users to sign up": off.
   - Email provider: **leave it on.** Password login depends on it. ("Confirm email" doesn't matter, because accounts are created already confirmed.)
   - Minimum password length: 12.
   - Multi-factor authentication: enable TOTP.
   - Site URL: your Vercel address. You only get it in step 7, so fill it in there, before anyone logs in.
5. JWT signing keys: check that asymmetric signing keys are active, so the app can verify sessions itself.
6. In the dashboard's legal documents section, conclude Supabase's data processing agreement (DPA). The privacy page says one exists. Vercel's DPA is part of its terms.

### 2. Your PC: `.env.supabase` and the migrations

Create a file named `.env.supabase` in the project folder with three lines:

```
DATABASE_URL=postgresql://postgres.<project-ref>:<postgres-password>@<pooler-host>:5432/postgres?sslmode=require
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<secret key from the Supabase API keys page>
```

`DATABASE_URL` uses the session pooler (port 5432) with the `postgres` user; copy the exact connection string from the Supabase "Connect" dialog. The file is git-ignored (`.env*`), and Next.js never loads it. Only `db:migrate:prod` and `user:prod` read it.

Then run:

```bash
npm run db:migrate:prod
```

Migrations have to run as `postgres`, because the default privileges for the two roles are set for that user. When a later change needs a new migration, run it before you merge the code that depends on it.

### 3. Role passwords

In the Supabase SQL editor, run once each:

```sql
ALTER ROLE pokedash_app WITH PASSWORD '<generated password>';
ALTER ROLE pokedash_ingest WITH PASSWORD '<generated password>';
```

Generate both passwords in a password manager and keep them there. Use only letters and digits, or URL-encode any special characters that go into a connection string.

### 4. Retention of login data

Supabase Auth keeps login audit entries (with the IP address) and sessions (with IP address and browser) until someone deletes them. To limit that, open `supabase/maintenance/auth-retention.sql` from this repository, paste it into the Supabase SQL editor and run it once (the editor runs as `postgres`). It turns on the pg_cron extension and schedules a daily job at 03:15 UTC that deletes:

- Auth audit-log entries older than 30 days
- sessions without activity for 30 days, together with their refresh tokens, so that browser has to log in again

The privacy page promises these 30 days, so don't skip this step. Running the file again is safe because it replaces the job. To check it, `select jobname, schedule, active from cron.job;` lists `pokedash-auth-retention`, and after the first night `cron.job_run_details` shows its runs as `succeeded`.

### 5. GitHub

1. Settings, Secrets and variables, Actions: add these repository secrets:
   - `INGEST_DATABASE_URL`: `postgresql://pokedash_ingest.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require` (session pooler, port 5432).
   - `CARDTRADER_TOKEN`
   - `POKEMONPRICETRACKER_API_KEY`
2. Settings, Code security: turn on Dependabot alerts, and secret scanning with push protection.
3. Code scanning already runs from `.github/workflows/codeql.yml`, so don't also enable CodeQL "default setup".

### 6. Merge into main

Merge the pull request for `feat/online` into `main` once its CI checks are green.

**Never import the repository into Vercel before this merge.** Vercel deploys the production branch (`main`) as soon as you import it. Without this merge, `main` has no login, no Impressum or Datenschutz, no security headers and no `vercel.json`, so the deal feed would be public.

### 7. Vercel

1. Import the GitHub repository. `vercel.json` already sets the region to fra1; check that the project shows it. Add the variables from point 2 in the import screen before the first deploy. If you add them later, redeploy afterwards.
2. Add these environment variables for **Production only**:
   - `DATABASE_URL`: `postgresql://pokedash_app.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require` (transaction pooler, port 6543).
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `IMPRINT_NAME`, `IMPRINT_STREET`, `IMPRINT_POSTAL_CITY`, `IMPRINT_EMAIL`: the real details for the Impressum.
3. **Never** set `SUPABASE_SECRET_KEY` on Vercel. Only your own PC needs it.
4. Preview deployments get none of these variables. Leave Vercel's deployment protection on so previews stay private.
5. The `IMPRINT_*` values are read when the site is built, so redeploy on Vercel after changing any of them.
6. Copy the production address into the Supabase Site URL (step 1.4) now, before anyone logs in for the first time.

### 8. First data

In GitHub, open the Actions tab, choose `Ingest daily` and press "Run workflow". It has to finish green, and its log shows only counts. `Ingest listings` has been running by itself every 30 minutes since the merge; you can also start it by hand.

### 9. Users

For yourself, and then for each friend:

```bash
npm run user:prod -- add <email>
```

The command prints a starting password once. Hand it over privately, not in a group chat. On their first login the person enters it, sets up an authenticator app (scan the QR code, type the code) and then chooses their own password (12 to 72 characters).

Set up your own authenticator on two devices, for example phone and tablet, so that losing one doesn't lock you out.

### 10. Check that it works

- Opening the site without being logged in sends you to `/login`.
- `/impressum` and `/datenschutz` show your real details.
- You can log in with password and code, on desktop and on your phone.
- Card pictures load.
- The first `Ingest daily` and `Ingest listings` runs are green.

### 11. Legal pages

Have the Impressum and Datenschutz pages checked by a German legal-text service (for example eRecht24) or a lawyer. Nobody with legal training has reviewed them yet.

## Day to day

- Add a user: `npm run user:prod -- add <email>`.
- Forgotten password: `npm run user:prod -- reset <email>`. It prints a new starting password once, and the person chooses a new one at the next login. If the account may be compromised, also end that user's active sessions in the Supabase dashboard (Auth, Users).
- Lost authenticator: in the Supabase dashboard, open Auth, Users, pick the user and remove their MFA factor. At the next login they set up a new authenticator.
- Change the Impressum: edit the `IMPRINT_*` variables on Vercel, then redeploy.

## Free-tier limits and known limits

- Supabase's rate limits for sign-in and code checks count the server's address, not the visitor's, so many failed attempts by anyone can briefly block logins for everyone.
- GitHub pauses scheduled workflows after 60 days without repository activity. If the data goes stale, open the Actions tab and turn them back on.
- Supabase Free pauses a project after 7 idle days. The 30-minute ingest keeps it awake as long as the GitHub schedule runs.
- The database limit is 500 MB. The daily job warns at 400 MB and the run turns red; shorten the retention then.
- Both ingest workflows share one concurrency group, and GitHub may drop a pending scheduled run when another one queues behind it. A daily run can therefore be skipped now and then without an error. The next day's run catches up.

## Data sources and US prices

Listings and market values both come from CardTrader. A product's market value is the median of the 3 cheapest other CardTrader EN/DE offers in the same edition and condition group, and at least 3 such offers are needed; with fewer, the dashboard shows "Too few offers" instead of a value. Cardmarket's public price guide is shown only as a note ("Cardmarket €x (all languages)"). It covers every language, so it is not used for the market value.

Each deal and each row in the singles and sealed tables has a "Check on Cardmarket" link. It is a plain link to Cardmarket's search, filtered to English and German in Near Mint or better. pokedash never reads Cardmarket pages. The link format is documented in `src/lib/cardmarket.ts`; open one once in a browser to confirm it lands where you expect.

Tracked sets (see `src/config/sets.ts`): 30th Celebration, plus these 15 WOTC sets: Base Set (with Shadowless as its own edition), Jungle, Fossil, Base Set 2, Team Rocket, Gym Heroes, Gym Challenge, Neo Genesis, Neo Discovery, Neo Revelation, Neo Destiny, Legendary Collection, Expedition Base Set, Aquapolis and Skyridge. The vintage sets show 1st Edition, Shadowless and Unlimited tabs where those editions exist.

Schedule: all 16 sets stay in the existing 30-minute listings job and the daily job, with no extra workflow. Measured locally on 2026-10-23, a listings-only run for all 16 sets took 21 seconds, and a full ingest (Cardmarket catalogue plus listings for 16 sets) took 75 seconds and produced about 115,000 available EN/DE listings. GitHub's limit for a job is 15 minutes. Production timing is still to be confirmed after the merge.

Run `npm run ingest` whenever you want fresh data locally. Without `CARDTRADER_TOKEN` it loads only Cardmarket values and skips CardTrader. The online workflows run the two parts separately:

```bash
npm run ingest -- --listings   # CardTrader listings only (the 30-minute job)
npm run ingest -- --daily      # Cardmarket values, US prices, cleanup and size check (the daily job)
```

Unlike the local run, these two fail (exit code 1, a red workflow) when a key they need is missing. `--listings` needs `CARDTRADER_TOKEN`, and `--daily` needs it plus `POKEMONPRICETRACKER_API_KEY`. The log names the missing secret, never its value, and the rest of the run still goes ahead.

US reference prices: get a free key at pokemonpricetracker.com and put it in `.env.local` as `POKEMONPRICETRACKER_API_KEY` (online, the GitHub secret of the same name). The ingest then fetches US English reference prices for sealed products and singles worth €5+, at most once per product per day. That uses about 87 of the free tier's 100 credits per day, and it stops early when credits run low. Without the key it skips US prices.

## Other commands

```bash
npm test                  # unit and end-to-end tests, in-memory database, no network
npm run lint
npm run typecheck
npm run build
npm run cardtrader:smoke  # checks the CardTrader token and how listings normalize
```
