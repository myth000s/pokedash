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
  ...over,
});

describe('DealFeed', () => {
  it('shows a deal with price, market value, discount and link', () => {
    render(<DealFeed deals={[deal()]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByRole('heading', { name: '30th Celebration Elite Trainer Box' })).toBeInTheDocument();
    for (const text of ['Sealed', 'CardTrader', 'DE', '€99.00', 'Shipping not included', 'Market value €132.95', 'High confidence', '€33.95 below market (26%)']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', 'https://www.cardtrader.com/cards/1001');
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
  });
  it('says when nothing has been checked yet', () => {
    render(<DealFeed deals={[]} now={NOW} lastCheckedAt={null} />);
    expect(screen.getByText('No listings have been checked yet.')).toBeInTheDocument();
  });
});
