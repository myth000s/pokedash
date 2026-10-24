// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DealFeed, MAX_SHOWN_DEALS } from './DealFeed';
import type { SortKey } from '@/deals/sections';
import type { DealView } from '@/deals/feed';

const NOW = new Date('2026-10-19T12:00:00Z');
const deal = (over: Partial<DealView> = {}): DealView => ({
  listingId: 1, productName: '30th Celebration Elite Trainer Box', kind: 'sealed', marketplace: 'cardtrader',
  url: 'https://www.cardtrader.com/cards/1001', condition: null, language: 'de', isReverseHolo: false, sellerCountry: 'DE', imageUrl: null,
  priceCents: 9900, shippingCents: null, currency: 'EUR', lastSeenAt: NOW,
  benchmark: { valueCents: 13295, basis: 'trend', confidence: 'high', reasons: [], capturedAt: new Date('2026-10-19T00:42:46Z') },
  score: { deliveredCents: 9900, shippingKnown: false, discountCents: 3395, discountPct: 0.2554, isDeal: true, warnings: ['Shipping not included'], notDealReasons: [] },
  edition: 'unlimited', rarity: null, setKey: '30th-celebration', cardmarketValueCents: 13295, cardmarketProductId: 895551,
  ...over,
});
const sneasel = deal({
  listingId: 2, productName: 'Sneasel [Fury Swipes | Beat Up]', kind: 'single', url: 'https://www.cardtrader.com/cards/413212',
  language: 'en', condition: 'near_mint', sellerCountry: 'PT', priceCents: 508,
  benchmark: { ...deal().benchmark, valueCents: 738 },
  score: { ...deal().score, discountCents: 230, discountPct: 0.3117, isDeal: true, warnings: ['Shipping not included'] },
});

describe('DealFeed', () => {
  it('shows the best deal as the hero', () => {
    render(<DealFeed deals={[deal()]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('Best deal right now')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '30th Celebration Elite Trainer Box' })).toBeInTheDocument();
    for (const t of ['Sealed', '€99.00', 'Shipping not included', '€132.95', 'High confidence', '€33.95 · −26%', 'Seller in DE', 'DE', 'CardTrader']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'View on CardTrader' })).toHaveAttribute('href', 'https://www.cardtrader.com/cards/1001');
  });
  it('shows an edition badge on vintage deals and none on modern ones', () => {
    const vintage = deal({ listingId: 7, productName: 'Charizard [Fire Spin]', kind: 'single', setKey: 'base-set', edition: 'first_edition', condition: 'near_mint' });
    const a = render(<DealFeed deals={[vintage]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('1st Edition')).toBeInTheDocument();
    a.unmount();
    const tile = render(<DealFeed deals={[vintage, deal({ listingId: 9, productName: 'Blastoise [Rain Dance]', kind: 'single', setKey: 'base-set', edition: 'shadowless' })]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('1st Edition')).toBeInTheDocument(); // hero
    expect(screen.getByText('Shadowless')).toBeInTheDocument(); // tile
    tile.unmount();
    const b = render(<DealFeed deals={[deal(), deal({ listingId: 8, setKey: 'base-set', edition: 'shadowless' })]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getAllByText('Shadowless')).toHaveLength(1);
    b.unmount();
    render(<DealFeed deals={[deal(), sneasel]} now={NOW} lastCheckedAt={NOW} />);
    for (const label of ['1st Edition', 'Shadowless', 'Unlimited']) expect(screen.queryByText(label)).not.toBeInTheDocument();
  });
  it('links every deal to Cardmarket in a new tab', () => {
    render(<DealFeed deals={[deal(), sneasel]} now={NOW} lastCheckedAt={NOW} />);
    const links = screen.getAllByRole('link', { name: /^Check on Cardmarket for / });
    expect(links).toHaveLength(2);
    for (const l of links) {
      expect(l.getAttribute('href')).toMatch(/^https:\/\/www\.cardmarket\.com\/en\/Pokemon\/Products\/Search\?searchString=/);
      expect(l).toHaveAttribute('target', '_blank');
      expect(l).toHaveAttribute('rel', 'noopener noreferrer');
      expect(l).toHaveTextContent('Check on Cardmarket');
    }
  });
  it('shows the nothing-matches panel when filters removed every deal', () => {
    render(<DealFeed deals={[]} now={NOW} lastCheckedAt={NOW} filter={{ active: true, totalBefore: 4, clearHref: '?tab=deals' }} />);
    expect(screen.getByText('Nothing matches your filters.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '?tab=deals');
    expect(screen.queryByText('No deals right now.')).not.toBeInTheDocument();
  });
  it('keeps the normal empty state when the unfiltered feed is empty', () => {
    render(<DealFeed deals={[]} now={NOW} lastCheckedAt={NOW} filter={{ active: true, totalBefore: 0, clearHref: '?tab=deals' }} />);
    expect(screen.getByText('No deals right now.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches your filters.')).not.toBeInTheDocument();
  });
  it('shows the result line only when filters are active', () => {
    const f = (active: boolean) => ({ active, totalBefore: 5, clearHref: '?tab=deals' });
    const a = render(<DealFeed deals={[deal()]} now={NOW} lastCheckedAt={NOW} filter={f(true)} />);
    expect(screen.getByText('1 deal matches your filters')).toBeInTheDocument();
    a.unmount();
    const b = render(<DealFeed deals={[deal(), sneasel, deal({ listingId: 3 })]} now={NOW} lastCheckedAt={NOW} filter={f(true)} />);
    expect(screen.getByText('3 deals match your filters')).toBeInTheDocument();
    b.unmount();
    render(<DealFeed deals={[deal()]} now={NOW} lastCheckedAt={NOW} filter={f(false)} />);
    expect(screen.queryByText(/match(es)? your filters/)).not.toBeInTheDocument();
  });
  it('labels the list with the chosen sort and shows the hero only for the default sorts', () => {
    const labels: [SortKey | null, string, boolean][] = [
      [null, 'biggest saving (€)', true], ['saving', 'biggest saving (€)', true],
      ['cheapest', 'cheapest first', false], ['expensive', 'most expensive first', false],
    ];
    for (const [sort, label, hero] of labels) {
      const { unmount } = render(<DealFeed deals={[deal(), sneasel]} now={NOW} lastCheckedAt={NOW} sort={sort} />);
      expect(screen.getByText(`Sorted by: ${label}`)).toBeInTheDocument();
      expect(screen.queryByText('Best deal right now') !== null).toBe(hero);
      // Without the hero both deals are plain tiles.
      expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(hero ? 1 : 2);
      unmount();
    }
  });
  it('shows at most the top 150 deals in the chosen order, and says how many there are', () => {
    const many = Array.from({ length: 1234 }, (_, i) => deal({ listingId: 1000 + i, productName: `Card ${i}`, priceCents: 1000 + i }));
    const { unmount } = render(<DealFeed deals={many} now={NOW} lastCheckedAt={NOW} sort="cheapest" />);
    expect(MAX_SHOWN_DEALS).toBe(150);
    expect(screen.getByText('Showing the top 150 of 1,234 deals. Use the filters to narrow them down.')).toBeInTheDocument();
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toHaveLength(150);
    expect(names[0]).toBe('Card 0');
    expect(names[149]).toBe('Card 149');
    unmount();
    // The filter result line keeps the full count.
    render(<DealFeed deals={many.slice(0, 151)} now={NOW} lastCheckedAt={NOW} filter={{ active: true, totalBefore: 2000, clearHref: '?tab=deals' }} />);
    expect(screen.getByText('151 deals match your filters')).toBeInTheDocument();
    expect(screen.getByText('Showing the top 150 of 151 deals. Use the filters to narrow them down.')).toBeInTheDocument();
  });
  it('shows no cap line at 150 deals or fewer', () => {
    const exactly = Array.from({ length: 150 }, (_, i) => deal({ listingId: 1000 + i, productName: `Card ${i}` }));
    render(<DealFeed deals={exactly} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.queryByText(/Showing the top/)).not.toBeInTheDocument();
  });
  it('shows only the hero when there is one deal', () => {
    render(<DealFeed deals={[deal()]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.queryByText('All deals')).not.toBeInTheDocument();
  });
  it('lists the other deals as tiles', () => {
    render(<DealFeed deals={[deal(), sneasel]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('All deals')).toBeInTheDocument();
    expect(screen.getByText('Sorted by: biggest saving (€)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Sneasel' })).toBeInTheDocument();
    expect(screen.getByText('EN · Near Mint · Seller PT')).toBeInTheDocument();
    expect(screen.getByText('Fury Swipes | Beat Up')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Sneasel on CardTrader' })).toHaveAttribute('title', 'Sneasel [Fury Swipes | Beat Up]');
    expect(screen.getByText('€2.30 · −31%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Sneasel on CardTrader' })).toHaveAttribute('href', 'https://www.cardtrader.com/cards/413212');
  });
  it('shows the seller country and the confidence reasons', () => {
    const d = deal({ benchmark: { ...deal().benchmark, confidence: 'medium', reasons: ['Market value is 30 hours old', 'Few recent sales'] } });
    render(<DealFeed deals={[d]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('Seller in DE')).toBeInTheDocument();
    expect(screen.getByText('Market value is 30 hours old · Few recent sales')).toBeInTheDocument();
    expect(screen.getByText('Medium confidence')).toBeInTheDocument();
  });
  it('omits the seller line when the country is unknown', () => {
    render(<DealFeed deals={[deal({ sellerCountry: null })]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.queryByText(/Seller in/)).not.toBeInTheDocument();
  });
  it('labels low and insufficient confidence', () => {
    const low = deal({ benchmark: { ...deal().benchmark, confidence: 'low' } });
    const none = deal({ listingId: 2, benchmark: { ...deal().benchmark, confidence: 'insufficient' } });
    render(<DealFeed deals={[low, none]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
  });
  it('shows known shipping', () => {
    render(<DealFeed deals={[deal({ shippingCents: 599 })]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('+ €5.99 shipping')).toBeInTheDocument();
  });
  it('shows the warning for unusually cheap listings', () => {
    const d = deal({ score: { ...deal().score, warnings: ['Shipping not included', 'Unusually cheap: check the listing carefully'] } });
    render(<DealFeed deals={[d]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('Unusually cheap: check the listing carefully')).toBeInTheDocument();
  });
  it('shows an empty state with the last check time', () => {
    render(<DealFeed deals={[]} now={NOW} lastCheckedAt={new Date(NOW.getTime() - 5 * 60_000)} />);
    expect(screen.getByText('No deals right now.')).toBeInTheDocument();
    expect(screen.getByText('Last checked 5 min ago')).toBeInTheDocument();
    expect(screen.getByText('A deal needs at least 20% below market value.')).toBeInTheDocument();
  });
  it('says when nothing has been checked yet', () => {
    render(<DealFeed deals={[]} now={NOW} lastCheckedAt={null} />);
    expect(screen.getByText('No listings have been checked yet.')).toBeInTheDocument();
  });
});
