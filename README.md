# pokedash

A private dashboard that finds underpriced Pokémon TCG listings. It loads Cardmarket's public price guide as the market value (sales-based fields only), pulls listings from CardTrader, and shows the ones priced well below market. The first tracked set is 30th Celebration.

Kleinanzeigen is intentionally not supported: its terms ban scrapers.

## Prerequisites

- Node 24
- Docker Desktop (runs the local Supabase Postgres database)
- A CardTrader API token, from your CardTrader profile settings

## Setup and run

```bash
npm install
npx supabase start               # local Postgres on port 54322
cp .env.example .env.local       # then paste your CardTrader token into CARDTRADER_TOKEN
npm run db:migrate
npm run ingest                   # Cardmarket values, then CardTrader listings
npm run dev                      # http://localhost:3000
```

Run `npm run ingest` whenever you want fresh data. Without `CARDTRADER_TOKEN` it loads Cardmarket values only and skips CardTrader.

## Other commands

```bash
npm test                  # unit and end-to-end tests, in-memory database, no network
npm run cardtrader:smoke  # checks the CardTrader token and how listings normalize
```
