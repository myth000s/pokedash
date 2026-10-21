# pokedash online: private, secure, free

Date: 2026-10-20 · Status: draft, waiting for the owner's review
Builds on: `main` (slice 1 + Aurora UI + Singles/Sealed sections, PR #3).

## 1. Why

pokedash only runs on the owner's PC, and its data only updates when someone runs `npm run ingest` by hand. The owner wants it online, so that they and a few friends can use it from anywhere (including phones), with automatic updates. It must be secure ("no open vulnerabilities") and meet German and EU law for an internet presence. Hosting should be free.

## 2. Goals, non-goals, anti-goals

Goals:
- A private web service: only people the owner adds can log in, with a password plus a required authenticator-app code (TOTP MFA).
- Free hosting:
  - Vercel (Hobby) for the app, with server functions in Frankfurt.
  - Supabase (Free, region Frankfurt) for the database and login.
  - GitHub Actions for scheduled ingestion.
- Automatic updates: CardTrader listings every 30 minutes; Cardmarket prices, the ECB exchange rate, US reference prices and data cleanup once a day.
- Security hardening:
  - least-privilege database access
  - closed public database API
  - strict security headers
  - an auth-gated image proxy
  - automated vulnerability, secret and code scanning
  - zero known high/critical vulnerabilities
- Legal: Impressum and Datenschutzerklärung in German, linked from every page including the login page. Only essential cookies, so no cookie banner.
- Card pictures served through pokedash, so visitors never connect to CardTrader directly.

Non-goals (this round):
- Slabs.
- Logo sketches (a separate step after this one).
- Phone push notifications and email alerts.
- Watchlists and per-user settings.
- Custom domain (the free `*.vercel.app` address is fine).
- Commercial use.

Anti-goals:
- Any page or data reachable without a completed login including the MFA code. The exceptions are the login flow, `/impressum` and `/datenschutz`.
- Secrets or the owner's personal details in the repository. The Impressum details live only in hosting settings.
- Tracking, analytics, ads, or third-party scripts.
- Any paid plan or service.
- Breaking the existing rules: English/German only, ID-only matching, documented data sources only, and the PokemonPriceTracker free-tier budget.

## 3. Access and login

- Invite-only, and pokedash sends no emails.
  - Supabase's free built-in mailer only reaches members of the owner's Supabase team, at 2 emails per hour. The owner therefore chose password login over an email link: no extra email service, and no extra processor in the privacy policy.
  - Public sign-up is disabled in Supabase Auth.
  - The owner adds people with a small local script (e.g. `npm run user:add -- friend@example.com`). It creates a confirmed account with a strong random starting password and prints that password once.
    - The script runs only on the owner's PC.
    - It uses the Supabase secret (service-role) key from the owner's git-ignored `.env.local`. The web app never holds that key.
  - The owner hands the starting password over privately: in person, or through an end-to-end encrypted messenger.
  - Expected users: the owner plus 3 to 4 friends.
- First factor: email address plus password (Supabase password login).
  - Minimum length is 12 characters, set in Supabase Auth.
  - Supabase's own sign-in rate limits apply.
  - On the first login, the user must replace the starting password with their own.
- Second factor: a TOTP code from an authenticator app (Supabase MFA, free plan).
  - On the first login, the user must also enrol: scan a QR code and confirm one code.
  - Every session must reach AAL2 before anything except the login, password-change, enrolment, Impressum and privacy pages is shown or served. That includes data, API routes and the image proxy.
- Forgotten password: there is no "forgot password" email. The login page says to ask the owner, who sets a new starting password with the same script (e.g. `npm run user:reset -- friend@example.com`).
- Lost device:
  - The owner removes the user's MFA factor in the Supabase dashboard, and the user re-enrols on the next login.
  - The owner should enrol on two devices or in a password manager so they can't lock themselves out.
- Sign out is available on every page.
- Sessions use Supabase's secure, HTTP-only cookies via `@supabase/ssr` (essential cookies only).

## 4. Hosting and deployment (free)

| Part | Service | Settings |
|---|---|---|
| Web app (Next.js 16) | Vercel Hobby | Connected to the GitHub repo. Deploys `main` automatically. Function region `fra1` (Frankfurt). Environment variables hold all secrets and the Impressum details. |
| Database + login | Supabase Free | Region **Frankfurt (eu-central-1)**. The existing Drizzle migrations are applied by a CLI step. The app and ingest connect through the Supabase connection pooler, so postgres-js needs `prepare: false` in transaction mode. |
| Scheduled ingestion | GitHub Actions | Two scheduled workflows (listings every 30 min, daily job). Repository secrets hold the database URL for the ingest role, `CARDTRADER_TOKEN` and `POKEMONPRICETRACKER_API_KEY`. |

- The repository stays public. That keeps GitHub Actions free without minute limits. The run logs are public, so the ingest prints only counts and never secrets or personal data. GitHub also masks secrets.
- Local development keeps working as today: Docker Supabase plus `.env.local`.

## 5. Automatic updates

Two GitHub Actions workflows:

| Workflow | Schedule | What it runs |
|---|---|---|
| `ingest-listings` | every 30 minutes | CardTrader per-language listings only. Takes about 1 minute. |
| `ingest-daily` | once a day at ~01:30 UTC | Cardmarket price guide (published ~00:40 UTC), ECB rate, PokemonPriceTracker US prices (credits reset 00:00 UTC), and data cleanup (§8). Then CardTrader as well. |

The `npm run ingest` CLI gains modes, e.g. `--listings` and `--daily`. Without a flag it keeps today's behaviour (everything) for local use.

Run safety:
- A workflow `concurrency` group, so two ingests never overlap. This resolves the slice-1 follow-up "run lock".
- Job timeouts of 15 minutes.
- A non-zero exit code on errors, so GitHub marks the run as failed and emails the owner.

Free-tier caveats, which are mitigated or accepted:
- GitHub disables scheduled workflows in a repository with no activity for 60 days. The owner gets an email and can re-enable them with one click. The design accepts this and documents it in the README.
- Supabase Free pauses projects after 7 days of inactivity. The 30-minute ingest keeps the project active.

## 6. Security

- Authentication gate:
  - A Next.js request interceptor (Next 16 `proxy`) plus server-side checks in every data-reading server component and route.
  - Anything except the public pages requires a session at AAL2.
  - Unauthenticated users are redirected to `/login`; users at AAL1 go to MFA enrolment or verification.
- Database access, least privilege:
  - RLS enabled on every app table with policies only for the two pokedash roles, and table privileges revoked from Supabase's `anon` and `authenticated` roles (details in §11). The public Supabase Data API therefore exposes nothing.
  - A Postgres role `pokedash_app` has `SELECT` only on the app tables and is used by the web app.
  - A role `pokedash_ingest` has `SELECT/INSERT/UPDATE/DELETE` on the app tables and is used only by GitHub Actions. It has no DDL rights; migrations run as `postgres` from the owner's PC (§11).
  - Both roles are created by a migration; their passwords are set by the owner in Supabase and never committed.
  - The web app never holds the Supabase service-role key.
- Secrets live only in Vercel environment variables, GitHub Actions secrets, or local `.env.local` (git-ignored). Startup validates required environment variables without printing their values.
- HTTP security headers on all responses:
  - a Content-Security-Policy with no third-party scripts and `frame-ancestors 'none'`, images only from self and data:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` denying camera, microphone and geolocation
- Image proxy: a route (e.g. `/api/card-image?src=…`) that:
  - requires an AAL2 session
  - fetches only URLs that pass the existing `safeCardTraderImageUrl` allowlist (https, `cardtrader.com` / `www.cardtrader.com`)
  - follows redirects only to those hosts
  - accepts only `image/*` responses below a size cap (e.g. 2 MB)
  - returns the image with a private browser cache (`Cache-Control: private, max-age=86400`)
  - never acts as an open proxy

  `CardImage` uses this route instead of the CardTrader URL.
- Logging: no personal data (email addresses, IPs, tokens) in app or ingest logs.
- Repository scanning, all free for public repos:
  - Dependabot alerts and version-update PRs (`.github/dependabot.yml`)
  - secret scanning with push protection, turned on by the owner in the repo settings
  - CodeQL code scanning (`.github/workflows/codeql.yml`)
- CI on pull requests: tests, typecheck, lint, build, and `npm audit --omit=dev --audit-level=high`, which must pass.
- Known vulnerabilities (checked 2026-10-20):
  - Production dependencies: 0.
  - Dev tools: 9 (5 high, 4 moderate). They sit in `drizzle-kit`'s old `@esbuild-kit` / `esbuild` chain and in `eslint-config-next`'s `fast-glob` / `micromatch` / `braces` chain.
  - npm's suggested fixes are major downgrades, so the build resolves these with safe upgrades or `overrides`.
  - Goal: `npm audit` reports 0 high/critical overall before going live. Any remaining moderate dev-only finding is documented with a reason.
- Before going live: a security review of the whole change.

## 7. Data protection and legal (Germany/EU)

Claude is not a lawyer. These pages follow common practice; the owner may have them checked by a German legal-text service or a lawyer.

- `/impressum` (German, § 5 DDG / § 18 MStV):
  - name, postal address, email
  - read from environment variables: `IMPRINT_NAME`, `IMPRINT_STREET`, `IMPRINT_POSTAL_CITY`, `IMPRINT_EMAIL`
  - if a variable is missing, the page shows a clear placeholder and the build still works

  The owner's values are configured only in Vercel, not in the repo.
- `/datenschutz` (German, GDPR/DSGVO), covering:
  - the controller (the same environment-variable values)
  - the data processed: users' email addresses (used only as login names; pokedash sends no emails), password hashes, the MFA factor, session cookies, and server logs with IP addresses at Vercel and Supabase
  - purposes and legal bases: providing the private service (Art. 6(1)(b)/(f))
  - processors: Supabase (Frankfurt; DPA), Vercel (DPA; US company, EU–US Data Privacy Framework) and GitHub (processes no user data, only market data)
  - no tracking or analytics
  - fonts served locally (next/font, no Google connection)
  - card pictures fetched by the server, so visitors never connect to CardTrader
  - storage durations
  - the data subject's rights
  - the supervisory authority: Der Landesbeauftragte für den Datenschutz Niedersachsen
- Footer on every page, including login and MFA: "Impressum · Datenschutz".
- Cookies: only the essential session cookies (exempt from consent under § 25 (2) TDDDG), so no cookie banner.
- Data sources: the existing documented sources only; use stays private and non-commercial (PokemonPriceTracker free tier is for personal use).

## 8. Data retention (fits Supabase's 500 MB free tier)

The daily job deletes:
- listings marked unavailable for more than 30 days, with their price history
- listing price history older than 90 days
- US reference price rows older than 30 days
- benchmark snapshots older than 365 days

`fx_rates` is kept (tiny).

## 9. Owner setup steps (manual, guided)

1. Supabase:
   - Create a free project in Frankfurt.
   - Set the passwords for `pokedash_app` and `pokedash_ingest`.
   - Under Auth: disable sign-ups, keep only the email + password provider (no magic link), set the minimum password length to 12, enable TOTP MFA, and set the site URL to the Vercel address.
2. Vercel:
   - Import the GitHub repo and set the function region to `fra1`.
   - Add the environment variables: the app database URL, the Supabase URL and anon key, and the Impressum values.
3. GitHub:
   - Add the Actions secrets.
   - Turn on Dependabot alerts, secret scanning with push protection, and code scanning.
4. First run:
   - Run the migrations against Supabase as `postgres` from the owner's PC (Claude does this with the owner), then trigger `ingest-daily` once by hand. The database starts empty; local data isn't moved.
5. Users:
   - Create the accounts with `user:add` (Claude runs it with the owner) and hand each friend their starting password privately.
   - Everyone sets their own password and enrols MFA on first login. The owner enrols on two devices.

The README documents these steps.

## 10. Who decided what

The owner decided:
- Go online so friends can use it; private, invite-only.
- Free hosting.
- A required authenticator-app code for everyone.
- Login with a password plus that code, chosen over an email link. An email link would need an extra email service, because Supabase's free mailer only reaches the owner's own team.
- Security, data protection and German/EU legal compliance are required.
- An Impressum with their name, address and contact email, kept out of the repository.
- Card pictures served through pokedash.
- Accepted the hosting playback (Vercel + Supabase Frankfurt + GitHub Actions, public repo, updates every 30 min) and the security/legal playback ("fine at first").
- Switched their commit email to GitHub's noreply address. The old commits keep the personal email; no history rewrite.

Claude's calls, to be checked:
- The update schedule times (30 min / daily ~01:30 UTC).
- The two Postgres roles.
- The exact header set and the image-proxy limits.
- The retention durations.
- The `--listings` / `--daily` CLI modes.
- Documenting rather than fighting GitHub's 60-day schedule pause.
- No custom domain.
- German-language legal pages, while the UI stays English.
- The audit goal "0 high/critical overall, moderate dev-only documented".
- Everything in §11.

Left to the builder:
- The exact Supabase SSR wiring for Next 16 (check `node_modules/next/dist/docs` for `proxy`).
- The CSP mechanics (nonces vs hashes) within the stated policy.
- The login and MFA page layout in the Aurora style.
- The wording of the legal texts within §7's required content.

## 11. Details settled after the builder check (Claude's calls)

1. Migrations and database roles.
   - Migrations run as `postgres` by hand from the owner's PC, through the session pooler. The URL lives only in the owner's git-ignored `.env.local` (e.g. `MIGRATION_DATABASE_URL`), never in GitHub or Vercel.
   - Order for a later change: migrate first, then merge the code that needs it.
   - A migration creates `pokedash_app` and `pokedash_ingest` with `LOGIN` but no password. The owner sets the passwords once in the Supabase SQL editor.
   - Grants cover the existing tables and their sequences (identity columns need `USAGE` for inserts). `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` gives later tables the same grants automatically, and revokes Supabase's default grants to `anon` and `authenticated`.
   - RLS blocks every role except the table owner, so "deny-all" means explicit policies: `FOR SELECT TO pokedash_app USING (true)` and `FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true)`. There are no policies for `anon` or `authenticated`.
   - A test checks that every table in `public` has RLS enabled and policies only for the two pokedash roles, so a future migration can't forget them.
   - The migrations must still run on local Docker Supabase and in the PGlite tests, where `anon` and `authenticated` may not exist (e.g. guard the revokes with a role-exists check). The mechanics are left to the builder.
2. Shared data and caching.
   - Everyone sees the same data; nothing is per user.
   - `proxy` does a fast cookie check and redirects to `/login`.
   - The real check is one `requireAal2()` helper. It verifies the session with Supabase and requires AAL2. Every page, route handler and the image proxy calls it inside the request-time part (the existing `<Suspense>` + `await connection()` pattern) before any database query.
   - The prerendered shell contains no data, as today. `'use cache'` is not used for database data. `cacheComponents` and partial prefetching stay on.
3. Database size.
   - The local database is about 30 MB today (23,960 listing rows including unavailable ones, 226 products). That is far below 500 MB, and the retention in §8 keeps it bounded.
   - The daily job logs the database size and fails (so GitHub emails the owner) above 400 MB.
   - Supabase starts with a fresh ingest.
4. Environments. Only Vercel Production gets database and Supabase credentials. Preview deployments get none and fail closed. Vercel's deployment protection for previews stays on.
5. Connections.
   - Everything goes through Supabase's pooler. GitHub runners are IPv4-only, and the Free plan's direct connection is IPv6-only.
   - The web app uses transaction mode (port 6543) with `prepare: false` and a small pool per function instance.
   - The ingest and migrations use session mode (port 5432).
   - Pooler user names carry a `.<project-ref>` suffix. That is just part of the URL in the environment variable, so no code handles it.
6. Local development.
   - There is no auth bypass anywhere, not even in dev.
   - Local Supabase also starts its auth service, so login and MFA work locally exactly as online.
   - Tests mock `requireAal2()` at its boundary, and the helper has its own unit tests.
7. Password login details.
   - `user:add` and `user:reset` live in `scripts/` and print the starting password only once, to the owner's terminal, never to a log.
   - How the app knows a starting password must still be changed is left to the builder (e.g. a flag in the user's metadata that the change step clears). Tampering with that flag would only let a user keep the strong random password, so it isn't a security boundary.
