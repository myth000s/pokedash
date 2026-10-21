# pokedash Aurora UI: design

Date: 2026-10-19 · Status: draft, waiting for the owner's review
Builds on: `docs/superpowers/specs/2026-10-19-pokedash-design.md` (slice 1, the deal feed)
Reference mockup: `docs/superpowers/specs/assets/2026-10-19-aurora-desktop-mockup.html`. It's an HTML fragment made for the brainstorming viewer; open it in a browser for the look. The class names in it are throwaway.

## 1. Why

Slice 1 works, but the deal feed is a plain list of white cards. The owner wants pokedash to look and feel "super cool", like the Pokémon cards themselves: real card pictures and holographic shine. They don't want a shop list. They compared three directions in the browser and chose the Aurora Dashboard, a dark, glowing, holo-edged "command centre". They mostly use pokedash on a desktop screen.

## 2. Goals, non-goals, anti-goals

Goals:
- Restyle the deal feed page into the Aurora Dashboard look described in section 3.
- Show the real CardTrader picture of every card and sealed product.
- Make the best deal the one with the biggest saving in euros (owner's call), and show it in a large hero tile.
- Sort all deals by euro saving.
- Add a stats row, plus holographic hover and border effects that make the page feel like handling holo cards.
- Keep every piece of deal information the current card shows (spec §6), and keep it readable.

Non-goals (this round):
- Filters and sort controls. They stay in slice 4. The mockup's filter chips are not built now.
- Product detail pages, watchlists, alerts, light mode, a dedicated mobile design. Narrow screens just reflow.
- New data sources or changes to scoring rules.
- Pokémon type (energy) colours on tiles. We don't store a card's type, so this is left for later.

Anti-goals (failure even if it looks great):
- Effects that hide or blur the numbers that matter: price, market value, saving, confidence. Text must meet WCAG AA contrast on the dark background.
- Motion that can't be turned off. Everything animated must stop under `prefers-reduced-motion`.
- Official Pokémon logos or trademarked branding. The wordmark is our own "pokedash". The pictures are CardTrader's product photos of the item being sold.
- Layout jumping while pictures load. Space for a picture is reserved before it arrives.
- Emojis as icons. Use SVG icons if any are needed.

## 3. The look (decided in the mockups)

Theme: dark only.

| Token | Value |
|---|---|
| Page background | `#080a17` with three soft radial glows: cyan `#4cc9f0` (~28% opacity, top-left), purple `#b15cff` (~30%, top-right), pink `#f85888` (~22%, bottom) |
| Panel | `rgba(255,255,255,.06)`, border `rgba(255,255,255,.13)`, radius 12–14 px |
| Text / muted text | `#e9ecff` / `#a9b1e0` |
| Gold accent | `#ffd166` (labels such as "Best deal right now", best-saving number) |
| Saving / success | mint `#06d6a0` (saving pill: dark text on mint in the hero, mint-tinted outline pill on tiles) |
| Call to action | gradient `#ffd166 → #f8a14a`, dark text |
| Holo gradient | conic `#4cc9f0, #b15cff, #f85888, #ffd166, #06d6a0` |
| Warnings | amber, e.g. "Unusually cheap: check the listing carefully" |

Fonts: Russo One for headings and big numbers, Chakra Petch for body text. Both come from Google Fonts via `next/font/google` and replace Geist.

Layout, desktop first (from top to bottom; see the mockup):
1. Top bar: the "pokedash" wordmark in the holo gradient (clipped text), a set chip ("Set: 30th Celebration"), and on the right a pulsing mint dot with "Live · checked {age}". The age is the last time listings were checked.
2. Stats row, 5 tiles: *Deals now* (count) · *Best saving* (the hero's € saving, gold) · *Listings checked* (available listings in the set) · *Products tracked* (products in the set) · *Market values* (age of the newest market value, e.g. "Today" or "2 days old").
3. Hero, "Best deal right now": the deal with the biggest € saving. It has a slowly rotating holo border (conic gradient, about 7 s per turn) and a 3-column layout:
   - Picture (~200 px wide, 5:7).
   - Details: name; a subline with the rest of the Cardmarket name plus Single/Sealed; badges for language, condition, reverse holo, marketplace, seller country and confidence; a reasons line when confidence isn't high; "Market value from Cardmarket sales, updated {age} · listing seen {age} · shipping not included".
   - Price block: a big saving pill "€2.87 −22%", the price, the market value struck through, and a "View on CardTrader →" button.
4. "All deals" section: a heading and a quiet label "Sorted by: biggest € saving". Below it is a grid of tiles: 4 columns at ≥1280 px, 3 at ≥1024 px, 2 at ≥640 px, 1 below that. The grid shows every deal except the hero. Each tile has:
   - the picture (5:7)
   - the name
   - "EN · Near Mint · PT" (language · condition · seller country, plus "Reverse Holo" when relevant)
   - the price, with the market value struck through
   - a saving pill "€2.45 · −31%"
   - the listing age
   - any warnings
   The whole tile links to the listing (new tab).

Effects
- Holo hover on pictures: the picture tilts (`perspective` with about 5° X, −9° Y, scale 1.02, stronger shadow), and a rainbow foil gradient sweeps across it (`mix-blend-mode: color-dodge`), over about 250 ms. CSS-only is enough. A cursor-following variant is optional (builder's call).
- Hero border: rotating conic gradient.
- Live dot: soft pulse.
- All three stop under `prefers-reduced-motion`.

States
- Empty: a styled panel saying "No deals right now.", "Last checked {age}" (or "No listings have been checked yet."), and a short hint: "A deal needs at least 20% below market value."
- Loading: skeletons in the shape of the stats row, hero and tiles, as the Suspense fallback. This keeps the static shell instant.
- Error: `error.tsx` restyled to match ("Couldn't load deals right now." plus a retry button).
- Missing or broken picture: a gradient placeholder (holo gradient, dimmed) showing the product's first letter. No layout shift.

## 4. Data changes

- Pictures: CardTrader blueprints carry `image_url`, for example `https://cardtrader.com/uploads/blueprints/image/413227/preview_413227-raikou-…jpg` (checked 2026-10-19; it redirects to `www.cardtrader.com` and serves `image/jpeg`).
  - Add `image_url` (string, nullish) to the blueprint schema.
  - Add `imageUrl: string | null` to `NormalizedListing`, a nullable `image_url` column on `listings` (new migration), and `imageUrl` on `DealView`.
  - Ingestion stores and updates it on every run.
  - If Next's `<Image>` is used, allow both `cardtrader.com` and `www.cardtrader.com` as remote image hosts.
- Sort order: the feed is sorted by `discountCents` descending (biggest € saving), then `discountPct` descending, then `lastSeenAt` descending. The first deal is the hero. This replaces today's sort by percentage.
- Stats: a small query for the stats row: count of available listings in the set, product count in the set, newest market-value `capturedAt`, and the last-checked time (this one already exists).

## 5. Constraints

- Next.js 16.4.2 with `cacheComponents: true`. Request-time data goes in a `<Suspense>` boundary with `await connection()`, as the page does today. Read `node_modules/next/dist/docs/` before changing pages, fonts or images.
- Tailwind CSS v4: define the tokens in `globals.css` (`@theme`).
- Keep the money, ID-matching and secrets rules from the slice 1 spec.
- Existing tests keep passing. Component tests that assert exact copy are updated where the copy changes, and new copy gets tests.
- Accessibility:
  - visible focus rings
  - links and buttons at least 44 px tall
  - picture `alt` = the product name
  - colour is never the only signal (savings carry text)

## 6. Who decided what

The owner decided:
- It should feel like the cards themselves (holo shine, card pictures).
- The Aurora Dashboard direction.
- Desktop first.
- "Best deal" means the biggest € saving.
- Real CardTrader pictures.
- They accepted the layout playback without changes ("continue").

Claude's calls, to be checked:
- Dark mode only.
- The colours and fonts, taken from the ui-ux-pro-max skill's gaming suggestions.
- The grid is also sorted by € saving, and leaves the hero out.
- Filter chips are not built now.
- The definitions of the five stats tiles.
- CSS-only holo hover.
- How the reduced-motion, empty, loading, error and missing-picture states behave.
- Pictures are stored per listing.
- No type colours for now.

## 7. Details settled after the builder check (Claude's calls)

1. Price, shipping and saving.
   - The price slot shows the item price.
   - Directly under it: "+ €X shipping" when shipping is known, or "Shipping not included" when it's unknown. Today it's always unknown on CardTrader.
   - The saving pill and the sort use the scorer's `discountCents` / `discountPct`. Those are already based on price plus known shipping, so nothing changes in scoring.
   - The hero's freshness line ends with "shipping not included" only when shipping is unknown.
2. Existing listings without pictures. No backfill step. The new column starts empty, and the next `npm run ingest` updates every listing it sees (each run upserts all of them). Until then the placeholder shows. The plan's last step runs an ingest.
3. Picture URL safety. `normalize.ts` keeps `image_url` only if it is `https:` and the host is `cardtrader.com` or `www.cardtrader.com`. Anything else becomes `null`. The UI only renders what's stored.
4. Stats scope. There's one tracked set today, so stats are scoped to `TRACKED_SETS[0].key`. The set chip shows `TRACKED_SETS[0].name`.
   - *Listings checked* = all available listings for that set's products, including non-deals.
   - *Market values* = the age of the newest snapshot for that set. Cardmarket is loaded for the whole set at once, so newest equals all.
   - The feed query stays as it is apart from the sort.
5. Edge cases.
   - With one deal, show only the hero and hide the "All deals" section.
   - With no deals, the stats row still shows: *Deals now* 0, and *Best saving* shows "–". The empty-state panel takes the hero's place.
   - The sort comparator is null-safe (nulls last), even though deals always have a saving.
6. Broken pictures. A small client component (e.g. `CardImage`) is fine. It swaps to the placeholder on `onError`. The hover effect stays CSS.
7. Mockup vs. tokens.
   - The token table in §3 gives the values. The mockup gives the look and proportions.
   - `format.ts` gains whatever variant the stats tile needs ("Today" / "N days old").
   - `layout.tsx` keeps `suppressHydrationWarning` on `<html>`, which guards against browser extensions like Dark Reader.

Left to the builder:
- Component split and file structure.
- `<Image>` vs. a plain lazy `<img>`.
- The exact skeleton shapes.
- The cursor-following holo variant.
- The exact breakpoints within the ranges above.
- How the Cardmarket name is split into title and subline (for example "Raikou" + "Amazing Shot").
