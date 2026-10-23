// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DealFeed } from './DealFeed';
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
  it('shows only the hero when there is one deal', () => {
    render(<DealFeed deals={[deal()]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.queryByText('All deals')).not.toBeInTheDocument();
  });
  it('lists the other deals as tiles', () => {
    render(<DealFeed deals={[deal(), sneasel]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('All deals')).toBeInTheDocument();
    expect(screen.getByText('Sorted by: biggest € saving')).toBeInTheDocument();
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
