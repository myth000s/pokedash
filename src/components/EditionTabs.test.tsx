// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BASE_SET, BASE_SET_2, JUNGLE } from '@/config/sets';
import { parseDashboardParams } from '@/lib/params';
import { EditionTabs } from './EditionTabs';

describe('EditionTabs', () => {
  it('shows 1st Edition, Shadowless and Unlimited for Base Set', () => {
    render(<EditionTabs params={parseDashboardParams({ tab: 'singles', set: 'base-set' })} set={BASE_SET} />);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['1st Edition', 'Shadowless', 'Unlimited']);
  });
  it('has no Shadowless for Jungle', () => {
    render(<EditionTabs params={parseDashboardParams({ tab: 'singles', set: 'jungle' })} set={JUNGLE} />);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['1st Edition', 'Unlimited']);
  });
  it('has only Unlimited for a set without a 1st Edition', () => {
    render(<EditionTabs params={parseDashboardParams({ tab: 'singles', set: 'base-set-2' })} set={BASE_SET_2} />);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Unlimited']);
  });
  it('marks Unlimited as current by default and the chosen edition otherwise', () => {
    const a = render(<EditionTabs params={parseDashboardParams({ tab: 'singles', set: 'base-set' })} set={BASE_SET} />);
    expect(screen.getByRole('link', { name: 'Unlimited' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '1st Edition' })).not.toHaveAttribute('aria-current');
    a.unmount();
    render(<EditionTabs params={parseDashboardParams({ tab: 'singles', set: 'base-set', edition: 'shadowless' })} set={BASE_SET} />);
    expect(screen.getByRole('link', { name: 'Shadowless' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Unlimited' })).not.toHaveAttribute('aria-current');
  });
  it('marks none as current on Deals without an edition filter', () => {
    render(<EditionTabs params={parseDashboardParams({ set: 'base-set' })} set={BASE_SET} />);
    for (const a of screen.getAllByRole('link')) expect(a).not.toHaveAttribute('aria-current');
  });
  it('keeps q and set in the hrefs', () => {
    render(<EditionTabs params={parseDashboardParams({ tab: 'singles', set: 'base-set', q: 'char' })} set={BASE_SET} />);
    expect(screen.getByRole('link', { name: '1st Edition' })).toHaveAttribute('href', '?tab=singles&q=char&set=base-set&edition=first_edition');
    expect(screen.getByRole('link', { name: 'Unlimited' })).toHaveAttribute('href', '?tab=singles&q=char&set=base-set&edition=unlimited');
  });
});
