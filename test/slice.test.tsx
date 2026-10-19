// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runIngestion } from '@/ingest/run';
import { getDealFeed } from '@/deals/feed';
import { DealFeed } from '@/components/DealFeed';
import { createCardTraderProvider } from '@/providers/cardtrader/provider';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { createTestDb } from './helpers/db';
import { cardmarketFetch } from './helpers/cardmarket';
import { fakeProvider } from './helpers/fake-provider';
import { ctBlueprint, ctProduct } from './fixtures/cardtrader';

const NOW = new Date('2026-10-19T12:00:00Z');
const cardtrader = createCardTraderProvider({
  expansions: vi.fn(async () => [{ id: 501, game_id: 5, code: 'a', name: '30th Celebration' }]),
  blueprints: vi.fn(async () => [ctBlueprint({ id: 3003, card_market_ids: [895551] })]),
  marketplaceProducts: vi.fn(async () => ({ '3003': [ctProduct({ id: 42, blueprint_id: 3003, name_en: 'Elite Trainer Box', price: { cents: 9900, currency: 'EUR' }, properties_hash: { pokemon_language: 'de' } })] })),
});

describe('slice 1, end to end', () => {
  it('ingests Cardmarket and CardTrader data and shows a scored deal', async () => {
    const db = await createTestDb();
    const [report] = await runIngestion(db, { fetchJson: cardmarketFetch(), providers: [cardtrader] }, [SET], NOW);
    expect(report.cardmarket).toMatchObject({ products: 7, snapshots: 7 });
    expect(report.providers[0]).toMatchObject({ marketplace: 'cardtrader', result: { upserted: 1 } });
    render(<DealFeed deals={await getDealFeed(db, { now: NOW })} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByRole('heading', { name: '30th Celebration Elite Trainer Box' })).toBeInTheDocument();
    expect(screen.getByText('€33.95 below market (26%)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', 'https://www.cardtrader.com/cards/3003');
  });
  it('keeps going when one provider fails', async () => {
    const db = await createTestDb();
    const [report] = await runIngestion(db, { fetchJson: cardmarketFetch(), providers: [fakeProvider('ebay', new Error('eBay down')), cardtrader] }, [SET], NOW);
    expect(report.providers).toEqual([
      { marketplace: 'ebay', error: 'eBay down' },
      expect.objectContaining({ marketplace: 'cardtrader', result: expect.objectContaining({ upserted: 1 }) }),
    ]);
  });
});
