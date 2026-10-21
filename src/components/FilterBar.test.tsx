// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clearFiltersHref, parseDashboardParams, type DashboardParams } from '@/lib/params';
import { FilterBar } from './FilterBar';

const p = (sp: Record<string, string> = {}): DashboardParams => parseDashboardParams(sp);
const hidden = (c: HTMLElement, name: string) => c.querySelector(`input[type="hidden"][name="${name}"]`);

describe('FilterBar', () => {
  it('renders all controls and Apply on deals', () => {
    render(<FilterBar params={p()} />);
    for (const l of ['Search', 'Language', 'Type', 'Min. saving', 'Max. price (€)']) expect(screen.getByLabelText(l)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });
  it('renders only Search and Language on singles and sealed', () => {
    for (const tab of ['singles', 'sealed']) {
      const { unmount } = render(<FilterBar params={p({ tab })} />);
      expect(screen.getByLabelText('Search')).toBeInTheDocument();
      expect(screen.getByLabelText('Language')).toBeInTheDocument();
      for (const l of ['Type', 'Min. saving', 'Max. price (€)']) expect(screen.queryByLabelText(l)).not.toBeInTheDocument();
      unmount();
    }
  });
  it('pre-fills the controls from params', () => {
    render(<FilterBar params={p({ q: 'pika', lang: 'de', kind: 'sealed', min: '40', max: '25' })} />);
    expect(screen.getByLabelText('Search')).toHaveValue('pika');
    expect(screen.getByLabelText('Language')).toHaveValue('de');
    expect(screen.getByLabelText('Type')).toHaveValue('sealed');
    expect(screen.getByLabelText('Min. saving')).toHaveValue('40');
    expect(screen.getByLabelText('Max. price (€)')).toHaveValue(25);
  });
  it('carries tab, all and type as hidden inputs', () => {
    const a = render(<FilterBar params={p()} />);
    expect(hidden(a.container, 'tab')).toHaveValue('deals');
    a.unmount();
    const b = render(<FilterBar params={p({ tab: 'singles', all: '1' })} />);
    expect(hidden(b.container, 'tab')).toHaveValue('singles');
    expect(hidden(b.container, 'all')).toHaveValue('1');
    b.unmount();
    const c = render(<FilterBar params={p({ tab: 'sealed', type: 'etb' })} />);
    expect(hidden(c.container, 'type')).toHaveValue('etb');
    expect(hidden(c.container, 'all')).toBeNull();
  });
  it('shows a hostile q as text, never as markup', () => {
    const q = '"><script>x</script>';
    const { container } = render(<FilterBar params={p({ q })} />);
    expect(screen.getByLabelText('Search')).toHaveValue(q);
    expect(container.querySelector('script')).toBeNull();
  });
  it('caps the max price input', () => {
    render(<FilterBar params={p()} />);
    expect(screen.getByLabelText('Max. price (€)')).toHaveAttribute('max', '100000');
  });
  it('shows Clear filters only when a filter is active', () => {
    const a = render(<FilterBar params={p()} />);
    expect(screen.queryByRole('link', { name: 'Clear filters' })).not.toBeInTheDocument();
    a.unmount();
    const params = p({ q: 'pika', min: '40' });
    render(<FilterBar params={params} />);
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', clearFiltersHref(params));
  });
});
