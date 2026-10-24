/**
 * Link to Cardmarket's product search, filtered to English + German offers in Near Mint or better.
 *
 *   https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=<name>&language=1,3&minCondition=2
 *
 * Parameter meanings come from public third-party examples, not from Cardmarket documentation:
 * language ids 1 = English and 3 = German; minCondition 2 = Near Mint. Product pages are known
 * to accept `?language=1&minCondition=2`. The format was NOT verified against the live site:
 * Cloudflare answers automated requests with 403, and pokedash never fetches Cardmarket pages.
 * The owner must verify the link with one click in a browser.
 *
 * The product id is not used yet: addressing a product by id could not be checked. The parameter
 * stays so a later id-based link needs no caller changes. Sealed products have no condition;
 * minCondition is harmless there.
 */
export function cardmarketCheckUrl(cardmarketProductId: number, productName: string): string {
  void cardmarketProductId;
  const query = new URLSearchParams({ searchString: productName, language: '1,3', minCondition: '2' });
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?${query.toString()}`;
}
