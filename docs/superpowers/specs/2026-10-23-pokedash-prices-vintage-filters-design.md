# pokedash: EN/DE prices, WOTC vintage sets and more filters

Date: 2026-10-23. Status: draft, waiting for the owner's review.
Builds on `main` (live at pokedash-xyz.vercel.app): deals feed, Singles and Sealed tables, search and filters, login with TOTP, scheduled updates.

## 1. Why

The owner wants more deals, older sets and better filters. Three problems stand in the way.

- **Wrong market values.** pokedash measures every offer against Cardmarket's public price guide. That guide mixes all languages and averages past sales. The owner compares differently: against the cheapest English and German offers in the same condition. Example: Gengar ex (30th Celebration #154) shows a Cardmarket value of €58.68, while English Near Mint offers start at €86.64, with the next three at €90.04, €91.98 and €92.60. pokedash calls a normal price "+48% above market" and misses real deals in the other direction.
- **Only one set.** Only 30th Celebration is tracked. The owner wants the WOTC era (1999 to 2003), where 1st Edition, Shadowless and Unlimited copies of the same card have very different prices.
- **Too few ways to narrow the lists.** There is no sorting by price and no rarity filter.

## 2. Goals, non-goals, anti-goals

**Goals**
- A market value per card built only from current English and German offers, in the same condition and the same edition.
- All English WOTC sets, with German copies too, and their own sections for 1st Edition, Shadowless and Unlimited.
- Sorting by cheapest and most expensive, a rarity filter, plus set, edition and condition filters.
- A one-click check on Cardmarket for every card.

**Non-goals (this round)**
- Slabs.
- Alerts and notifications.
- Japanese WOTC sets (CardTrader lists them separately, for example "Rocket Gang"). EN and DE only.
- New US price lookups for vintage.

**Anti-goals**
- Reading Cardmarket's offer lists by any means. Cardmarket's API is limited to professional sellers and explicitly forbids requesting public market data on consecutive days, and scraping is against its terms. Only documented sources, as before.
- Comparing across languages other than EN/DE, across editions or across conditions. A worn or Unlimited copy must never look like a deal because it is compared with a better or rarer one.
- A deal shown on too few offers to judge.

## 3. Part A: market value from English and German offers

- **Reference value (EN/DE):** for each product, edition and condition group, the **median of the 3 cheapest other** English and German offers on CardTrader. "Other" means not counting the offer being judged.
- **Condition groups:** Mint and Near Mint form one group. For vintage, Slightly Played and Moderately Played are separate groups.
- **Too few offers:** with fewer than 3 other offers in the group, there is no reference value. The card shows "too few offers" and never counts as a deal.
- **Deal:** an offer at least **20% below** its reference value, as today.
- **Freshness:** listings older than 3 days don't count, as today.
- **Cardmarket check:** each card row and deal tile gets a "Check on Cardmarket" link that opens the Cardmarket product page filtered to English and German, minimum Near Mint. The link is a plain link; pokedash never reads that page.
- **Old values as notes:** the Cardmarket price-guide value stays as a small note labelled "all languages". The US price stays as today for 30th Celebration.
- **Example after the change:** Gengar ex at €86.64 against a reference of €91.98 (median of €90.04, €91.98 and €92.60). That is a normal price, not "+48%".
- **Scope:** this replaces the market value for all sets, 30th Celebration included.

## 4. Part B: WOTC vintage sets

**Sets.** Checked on CardTrader on 2026-10-23, with expansion ids:

| Set | id | Set | id |
|---|---|---|---|
| Base Set | 1472 | Gym Challenge | 1481 |
| Base Set Shadowless | 1969 | Neo Genesis | 1482 |
| Jungle | 1473 | Neo Discovery | 1483 |
| Fossil | 1476 | Neo Revelation | 1485 |
| Base Set 2 | 1478 | Neo Destiny | 1486 |
| Team Rocket | 1479 | Legendary Collection | 1487 |
| Gym Heroes | 1480 | Expedition Base Set | 1488 |
| | | Aquapolis | 1491 |
| | | Skyridge | 1492 |

**Languages:** English and German copies, both fetched with CardTrader's per-language call, as today.

**Editions:**
- **1st Edition:** an offer with `first_edition: true`. CardTrader marks this on every offer. In the Base Set sample, 125 of 8,626 English offers had it.
- **Shadowless:** an offer from the "Base Set Shadowless" expansion (id 1969) without 1st Edition.
- **Unlimited:** every other offer.

**Sections.** For vintage sets, the Singles and Sealed views get sub-sections **1st Edition · Shadowless · Unlimited**. Shadowless only appears for Base Set. Deals show the edition as a badge.

**Conditions.** For vintage, Near Mint (with Mint), Slightly Played and Moderately Played count. Each is compared only within its own group (Part A). 30th Celebration keeps Near Mint and Mint only.

**Sealed.** Sealed WOTC products (boosters, theme decks) are included when CardTrader has EN/DE offers for them.

**US prices.** None for vintage. The free tier's 100 credits a day are already used by 30th Celebration.

**Volume.** Base Set alone had 8,626 English offers, so all WOTC sets in EN and DE could mean roughly 60,000 to 100,000 offers. The listings ingest must still finish well inside GitHub's 15-minute job limit; it now writes in batches of 500. The database must stay inside Supabase's 500 MB, with the 400 MB alarm as today.

## 5. Part C: filters and sorting

- **Sort by:** cheapest first, most expensive first, and biggest saving. Each list keeps today's default: biggest saving for Deals, market value for Singles and Sealed.
- **Rarity:** choose one or more, for example Common, Uncommon, Rare, Holo Rare, Illustration Rare, Special Illustration Rare or Hyper Rare. The values come from CardTrader's `pokemon_rarity`, and only rarities that occur in the chosen set are offered. Base Set's values were Common, Uncommon, Rare and Holo Rare; 12 Base Set blueprints had no rarity (likely Trainer and Energy cards), and those show under "No rarity".
- **Set:** "All sets" or one set.
- **Edition (vintage):** 1st Edition, Shadowless, Unlimited.
- **Condition:** Near Mint, Slightly Played, Moderately Played.
- **Unchanged from today:** filters live in the page address, so a filtered view can be bookmarked; the bar works without JavaScript, works at phone width, and every control has a visible label at least 44 px tall.

## 6. Constraints carried over

- Only English and German offers, matched by IDs, from documented sources only.
- Deals are at least 20% below the reference; nothing older than 3 days counts.
- Security and privacy are unchanged:
  - login with AAL2, server-only database access, read-only app role
  - no seller names stored
  - the picture proxy only allows CardTrader hosts
- Free tiers only: Vercel Hobby, Supabase Free and GitHub Actions, with the existing schedules.

## 7. Who decided what

**The owner decided:**
- Prices only from English and German cards.
- The "right price" is what the cheapest English and German Near Mint offers cost now, the way they check on Cardmarket.
- Option C: CardTrader EN/DE offers as the value, plus a Cardmarket check link, with the old average as a note only.
- WOTC sets, with separate sections for 1st Edition, Shadowless and Unlimited.
- Vintage conditions: Near Mint, Slightly Played, Moderately Played.
- Sorting by cheapest and most expensive, and a rarity filter.
- "That's it for now."

**Claude's calls, to be checked:**
- The median of the 3 cheapest other offers, and the minimum of 3 offers.
- Comparing within the same condition group, with Mint grouped with Near Mint.
- The set list above, and that German copies and sealed vintage are included.
- No US prices for vintage.
- Set, edition and condition filters; rarity lists only rarities present in the chosen set.
- Edition sub-sections inside Singles and Sealed.
- The Cardmarket average kept as a note.
- 30th Celebration keeps Near Mint and Mint only.

## 8. Details settled after the builder check (Claude's calls)

1. **Products and editions.**
   - A product stays one Cardmarket product, matched through CardTrader's `card_market_ids`, as today. Edition is a property of each **listing**, not of the product.
   - Shadowless offers come from CardTrader expansion 1969. They map to the same Cardmarket product as Base Set and get edition "shadowless". For matching, a blueprint's Cardmarket ids are narrowed to the tracked set's Cardmarket expansions, so Shadowless and Base Set don't trip the "ambiguous match" skip.
   - Blueprints without a Cardmarket id are skipped, as today.
   - `TrackedSet` replaces the CardTrader name prefix with explicit CardTrader expansion ids, and gains the WOTC sets' Cardmarket expansion ids. The builder looks those up in Cardmarket's public expansion list.
2. **Cardmarket catalog.**
   - Product names, ids and the "all languages" note still come from Cardmarket's public downloads, for every tracked set.
   - The check link points at the Cardmarket product. It is not edition-specific, because Cardmarket has no edition-specific page; its filter reduces it to EN/DE and Near Mint.
3. **The reference pool.** Within one product, the pool takes EN and DE offers together, from any seller country. It is split by:
   - edition
   - condition group
   - reverse holo or not, keeping today's like-for-like rule
   - item price only, because CardTrader's shipping is unknown

   Listings older than 3 days are left out of the pool too. Whether the reference is computed at query time or stored at ingest is the builder's choice.
4. **Edge rules.**
   - "Other offers" excludes the offer being judged, so an offer among the 3 cheapest is judged against the next 3.
   - The €5 minimum value and the "suspiciously cheap" warning at 60% stay, applied to the new reference.
   - The old benchmark confidence and age logic is replaced by the single "too few offers" rule.
5. **Edition rules.**
   - `first_edition` is read from the offer. If true, the edition is 1st Edition, even in expansion 1969.
   - Only sets that had a 1st Edition print honour the flag: Base Set, Jungle, Fossil, Team Rocket, Gym Heroes, Gym Challenge and Neo Genesis to Neo Destiny. In Base Set 2, Legendary Collection, Expedition, Aquapolis and Skyridge every offer counts as Unlimited, which avoids false 1st Edition labels.
6. **Rarity.** Read from the offer's `pokemon_rarity`, for 30th Celebration too. Cards without it go under "No rarity".
7. **Update frequency.** Vintage listings should run with the 30-minute job if the run stays well under 15 minutes. If not, vintage moves to an hourly job, and as a last resort runs at least every 6 hours, which still satisfies the 3-day freshness rule. The builder measures and documents the choice.
8. **Market value column.** In Singles and Sealed, the market value of a card is the median of its 3 cheapest EN/DE offers in Near Mint (for vintage, per edition), or "too few offers".

## 9. Left to the builder

- **Data model:**
  - how products for many sets are stored, keeping ID matching via CardTrader's `card_market_ids`
  - how edition and rarity are stored per listing
  - indexes for the larger tables
- **Cardmarket link:** the exact URL and filter parameters, to be verified on cardmarket.com, and how a product page is addressed.
- **Ingest:** splitting the listings run if needed to stay within 15 minutes, for example vintage at a lower frequency, documented in the README.
- **Layout:** the sub-section and filter layout within the existing Aurora and Shadow look.
- **Performance:** keeping the dashboard queries fast with many more listings.
