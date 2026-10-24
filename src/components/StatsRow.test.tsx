// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsRow } from './StatsRow';

const NOW = new Date('2026-10-19T12:00:00Z');
const stats = { listingsChecked: 23638, productsTracked: 226, marketValuesAt: new Date('2026-10-19T00:42:46Z'), lastCheckedAt: NOW };

describe('StatsRow', () => {
  it('shows the five stats', () => {
    render(<StatsRow dealCount={5} bestSavingCents={287} stats={stats} now={NOW} />);
    for (const [label, value] of [['Deals now', '5'], ['Best saving', '€2.87'], ['Listings checked', '23,638'], ['Products tracked', '226'], ['Cardmarket notes', 'Today']]) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });
  it('shows dashes when nothing is known yet', () => {
    render(<StatsRow dealCount={0} bestSavingCents={null} stats={{ listingsChecked: 0, productsTracked: 0, marketValuesAt: null, lastCheckedAt: null }} now={NOW} />);
    expect(screen.getAllByText('–')).toHaveLength(2); // Best saving and Cardmarket notes
  });
});
