// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseDashboardParams } from '@/lib/params';
import { SectionTabs } from './SectionTabs';

describe('SectionTabs', () => {
  it('links the tabs and marks the active one', () => {
    render(<SectionTabs active="sealed" counts={{ deals: 5, singles: 52, sealed: 35 }} />);
    expect(screen.getByRole('link', { name: /Sealed/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Singles/ })).toHaveAttribute('href', '?tab=singles');
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Slabs/ })).not.toBeInTheDocument();
    expect(screen.getByText('Slabs · soon')).toHaveAttribute('aria-disabled', 'true');
  });
  it('keeps the search and language but drops deal-only filters across tabs', () => {
    const params = parseDashboardParams({ q: 'pika', min: '40' });
    render(<SectionTabs active="deals" counts={{ deals: 5, singles: 52, sealed: 35 }} params={params} />);
    expect(screen.getByRole('link', { name: /Singles/ })).toHaveAttribute('href', '?tab=singles&q=pika');
    expect(screen.getByRole('link', { name: /Deals/ })).toHaveAttribute('href', '?tab=deals&q=pika&min=40');
  });
});
