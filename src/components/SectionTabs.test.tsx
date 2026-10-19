// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
