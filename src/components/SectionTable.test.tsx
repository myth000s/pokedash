// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SectionRow } from '@/deals/sections';
import type { ScoredListing } from '@/domain/types';
import { parseDashboardParams } from '@/lib/params';
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
  it('names the chosen language in the header and the no-offer text', () => {
    const params = parseDashboardParams({ tab: 'sealed', lang: 'de' });
    render(<SectionTable section="sealed" rows={[row({ offer: null, offerCount: 0 })]} allSingles={false} sealedType={null} params={params} />);
    expect(screen.getByText('no DE offer yet')).toBeInTheDocument();
    expect(screen.getAllByText('Cheapest DE').length).toBeGreaterThan(0);
    expect(screen.queryByText(/EN\/DE/)).toBeNull();
  });
  it('keeps EN/DE without a language filter', () => {
    render(<SectionTable section="sealed" rows={[row({ offer: null, offerCount: 0 })]} allSingles={false} sealedType={null} />);
    expect(screen.getByText('no EN/DE offer yet')).toBeInTheDocument();
    expect(screen.getAllByText('Cheapest EN/DE').length).toBeGreaterThan(0);
  });
  it('keeps q and lang in the singles chips', () => {
    const params = parseDashboardParams({ tab: 'singles', q: 'pika', lang: 'de' });
    render(<SectionTable section="singles" rows={[]} allSingles={false} sealedType={null} params={params} />);
    expect(screen.getByRole('link', { name: 'All singles' })).toHaveAttribute('href', '?tab=singles&q=pika&lang=de&all=1');
    expect(screen.getByRole('link', { name: 'Worth €5+' })).toHaveAttribute('href', '?tab=singles&q=pika&lang=de');
  });
  it('keeps q and lang in the sealed chips', () => {
    const params = parseDashboardParams({ tab: 'sealed', q: 'box' });
    render(<SectionTable section="sealed" rows={[]} allSingles={false} sealedType={null} params={params} />);
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '?tab=sealed&q=box');
    expect(screen.getByRole('link', { name: 'Elite Trainer Boxes' })).toHaveAttribute('href', '?tab=sealed&q=box&type=etb');
  });
  it('shows a result line with singular and plural when filtering', () => {
    const filter = { active: true, totalBefore: 9, clearHref: '?tab=sealed' };
    const a = render(<SectionTable section="sealed" rows={[row()]} allSingles={false} sealedType={null} filter={filter} />);
    expect(screen.getByText('1 product matches your filters')).toBeInTheDocument();
    a.unmount();
    render(<SectionTable section="sealed" rows={[row(), row({ productId: 2 })]} allSingles={false} sealedType={null} filter={filter} />);
    expect(screen.getByText('2 products match your filters')).toBeInTheDocument();
  });
  it('shows no result line without active filters', () => {
    render(<SectionTable section="sealed" rows={[row()]} allSingles={false} sealedType={null} filter={{ active: false, totalBefore: 9, clearHref: '?tab=sealed' }} />);
    expect(screen.queryByText(/match your filters/)).not.toBeInTheDocument();
  });
  it('shows the nothing-matches panel only when products existed before filtering', () => {
    const a = render(<SectionTable section="sealed" rows={[]} allSingles={false} sealedType={null} filter={{ active: true, totalBefore: 9, clearHref: '?tab=sealed' }} />);
    expect(screen.getByText('Nothing matches your filters.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '?tab=sealed');
    a.unmount();
    render(<SectionTable section="sealed" rows={[]} allSingles={false} sealedType={null} filter={{ active: true, totalBefore: 0, clearHref: '?tab=sealed' }} />);
    expect(screen.getByText('No products in this section yet.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches your filters.')).not.toBeInTheDocument();
  });
  it('names each row link with the full product name', () => {
    render(<SectionTable section="singles" rows={[row({ productName: 'Mew [Psychic | 30C]', kind: 'single', sealedType: null })]} allSingles={false} sealedType={null} />);
    expect(screen.getByRole('link', { name: 'View Mew [Psychic | 30C] on CardTrader' })).toBeInTheDocument();
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
