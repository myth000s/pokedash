import { and, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import { GROUP_CONDITIONS, type ConditionGroup } from '@/deals/reference';

/** An offer is judged against 3 others, so its group needs at least 4 offers. */
export const MIN_GROUP_SIZE = 4;

/**
 * The condition group of a listing as SQL (the same mapping as conditionGroup): mint and near mint are
 * "nm", sealed products without a condition count as "nm", anything outside the groups is null.
 */
export function conditionGroupSql(): SQL<ConditionGroup | null> {
  const whens = (Object.entries(GROUP_CONDITIONS) as [ConditionGroup, string[]][])
    .map(([group, conditions]) => sql`when ${listings.condition} in ${conditions} then ${group}::text`);
  return sql<ConditionGroup | null>`(case ${sql.join(whens, sql` `)} when ${listings.condition} is null and ${products.kind} = ${'sealed'} then ${'nm'}::text end)`;
}

const MS_PER_HOUR = 3_600_000;

/**
 * The reference pool in SQL, ranked per group (product, edition, condition group, reverse holo): available
 * EN/DE offers in EUR, seen within maxAgeHours. Per offer it carries its rank by price (ties by id), the
 * group size, the 3 cheapest prices and `reference`: the second-cheapest *other* offer of its group
 * (rank 1-2: the 3rd cheapest; otherwise the 2nd), or null under MIN_GROUP_SIZE offers.
 * This is the query-time form of referenceValues in reference.ts, which stays as its test oracle.
 *
 * `where` narrows the pool (it may use listings and products columns). With `byLanguage`, each offer
 * also gets its rank and count within its group and language.
 */
export function rankedOffers(db: Db, opts: { now: Date; maxAgeHours: number; where?: SQL[]; byLanguage?: boolean }) {
  const group = conditionGroupSql();
  const cutoff = new Date(opts.now.getTime() - opts.maxAgeHours * MS_PER_HOUR);
  const pool = db.$with('pool').as(
    db.select({
      id: listings.id,
      productId: listings.productId,
      edition: listings.edition,
      isReverseHolo: listings.isReverseHolo,
      language: listings.language,
      priceCents: listings.priceCents,
      grp: sql<ConditionGroup>`${group}`.as('grp'),
    })
      .from(listings)
      .innerJoin(products, eq(products.id, listings.productId))
      .where(and(
        eq(listings.available, true),
        inArray(listings.language, ['en', 'de']),
        eq(listings.currency, 'EUR'),
        gte(listings.lastSeenAt, cutoff),
        sql`${group} is not null`,
        ...(opts.where ?? []),
      )),
  );

  // One window for every function, over the whole partition, so Postgres sorts the pool once.
  const partition = sql`partition by ${pool.productId}, ${pool.edition}, ${pool.grp}, ${pool.isReverseHolo}`;
  const w = sql`(${partition} order by ${pool.priceCents}, ${pool.id} rows between unbounded preceding and unbounded following)`;
  const rn = sql`row_number() over ${w}`;
  const n = sql`count(*) over ${w}`;
  const nth = (k: number) => sql`nth_value(${pool.priceCents}, ${k}::int) over ${w}`;
  const lw = sql`(${partition}, ${pool.language} order by ${pool.priceCents}, ${pool.id} rows between unbounded preceding and unbounded following)`;

  const ranked = db.$with('ranked').as(
    db.select({
      id: pool.id,
      productId: pool.productId,
      language: pool.language,
      rn: sql<number>`(${rn})::int`.as('rn'),
      n: sql<number>`(${n})::int`.as('n'),
      p1: sql<number | null>`${nth(1)}`.as('p1'),
      p2: sql<number | null>`${nth(2)}`.as('p2'),
      p3: sql<number | null>`${nth(3)}`.as('p3'),
      reference: sql<number | null>`(case when ${n} >= ${MIN_GROUP_SIZE}::int then case when ${rn} <= ${2}::int then ${nth(3)} else ${nth(2)} end end)`.as('reference'),
      langRank: (opts.byLanguage ? sql<number>`(row_number() over ${lw})::int` : sql<number>`null::int`).as('lang_rank'),
      langCount: (opts.byLanguage ? sql<number>`(count(*) over ${lw})::int` : sql<number>`null::int`).as('lang_count'),
    }).from(pool),
  );
  return { ctes: [pool, ranked] as const, ranked };
}
