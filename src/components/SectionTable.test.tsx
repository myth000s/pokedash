// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SectionRow } from '@/deals/sections';
import type { ScoredListing } from '@/domain/types';
import { SectionTable } from './SectionTable';

function row(over: Partial<SectionRow> = {}): SectionRow {
  return {
    productId: 1, productName: '30th Celebration Elite Trainer Box', kind: 'sealed', sealedType: 'etb', imageUrl: null,
    benchmark: { valueCents: 13295, confidence: 'high' } as SectionRow['benchmark'],
    us: { usdCents: 12886, eurCents: 11480 },
    offer: {
      listingId: 1, url: 'https://www.cardtrader.com/cards/399230', priceCents: 9900, language: 'en', sellerCountry: 'DE',
      score: { discountPct: 0.2554, discountCents: 3395, isDeal: true, warnings: [] } as unknown as ScoredListing,
    },
    offerCount: 2,
    ...over,
  };
}

describe('SectionTable', () => {
  it('shows a sealed row with market value, US reference, offer and difference', () => {
    render(<SectionTable section="sealed" rows={[row()]} allSingles={false} sealedType={null} />);
    for (const t of ['€132.95', '€114.80', '($128.86)', '€99.00', 'EN · DE', '−26%', '2']) expect(screen.getByText(t)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'View 30th Celebration Elite Trainer Box on CardTrader' });
    expect(link).toHaveAttribute('href', 'https://www.cardtrader.com/cards/399230');
    // "Elite Trainer Boxes" is also a toolbar chip, so look for the subline inside the row
    expect(within(link).getByText('Elite Trainer Boxes')).toBeInTheDocument();
  });
  it('shows a product without an offer', () => {
    render(<SectionTable section="sealed" rows={[row({ offer: null, offerCount: 0, us: null })]} allSingles={false} sealedType={null} />);
    expect(screen.getByText('no EN/DE offer yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2); // US and difference
  });
  it('marks offers above market value in red with a plus', () => {
    render(<SectionTable section="sealed" rows={[row({ offer: { ...row().offer!, priceCents: 15000, score: { ...row().offer!.score, discountPct: -0.128, isDeal: false } } })]} allSingles={false} sealedType={null} />);
    expect(screen.getByText('+13%')).toBeInTheDocument();
  });
  it('shows the singles chips and highlights the active one', () => {
    render(<SectionTable section="singles" rows={[]} allSingles={true} sealedType={null} />);
    expect(screen.getByRole('link', { name: 'All singles' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Worth €5+' })).toHaveAttribute('href', '?tab=singles');
    expect(screen.getByText('No products in this section yet.')).toBeInTheDocument();
  });
  it('shows one chip per sealed type', () => {
    render(<SectionTable section="sealed" rows={[]} allSingles={false} sealedType="etb" />);
    expect(screen.getByRole('link', { name: 'Elite Trainer Boxes' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Battle Decks' })).toHaveAttribute('href', '?tab=sealed&type=battle-decks');
  });
  it('labels every value for screen readers', () => {
    render(<SectionTable section="sealed" rows={[row({ offer: null, offerCount: 0, us: null })]} allSingles={false} sealedType={null} />);
    for (const l of ['Market value', 'US English-only', 'Cheapest EN/DE', 'Difference', 'Offers']) {
      expect(screen.getAllByText(l).some((el) => !el.closest('[aria-hidden="true"]'))).toBe(true);
    }
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });
  it('describes the row link with its values', () => {
    render(<SectionTable section="sealed" rows={[row()]} allSingles={false} sealedType={null} />);
    const link = screen.getByRole('link', { name: /^View/ });
    const target = document.getElementById(link.getAttribute('aria-describedby')!)!;
    expect(target).toHaveTextContent('€99.00');
    expect(target).toHaveTextContent('€132.95');
  });
});
