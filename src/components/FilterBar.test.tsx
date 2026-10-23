// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clearFiltersHref, parseDashboardParams, type DashboardParams } from '@/lib/params';
import { FilterBar } from './FilterBar';

const p = (sp: Record<string, string | string[]> = {}): DashboardParams => parseDashboardParams(sp);
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

  describe('set, sort, rarity and condition', () => {
    const rarities = ['Common', 'Rare Holo', 'No rarity'];
    it('labels Sort by, Set and Rarity with their options', () => {
      render(<FilterBar params={p({ tab: 'singles' })} rarities={rarities} />);
      const sort = screen.getByLabelText('Sort by');
      expect(within(sort).getAllByRole('option').map((o) => o.textContent)).toContain('Cheapest first');
      expect(screen.getByLabelText('Set')).toBeInTheDocument();
      const rarity = screen.getByLabelText('Rarity') as HTMLSelectElement;
      expect(rarity.multiple).toBe(true);
      expect(within(rarity).getAllByRole('option').map((o) => o.textContent)).toEqual(rarities);
    });
    it('defaults Singles and Sealed to Market value (empty) and Deals to Biggest saving', () => {
      for (const tab of ['singles', 'sealed']) {
        const { unmount } = render(<FilterBar params={p({ tab })} />);
        const sort = screen.getByLabelText('Sort by');
        expect(within(sort).getAllByRole('option').map((o) => o.textContent)).toEqual(['Market value', 'Biggest saving', 'Cheapest first', 'Most expensive first']);
        expect(sort).toHaveValue('');
        const form = sort.closest('form')!;
        expect(new FormData(form).get('sort')).toBe('');
        unmount();
      }
      render(<FilterBar params={p()} />);
      expect(screen.getByLabelText('Sort by')).toHaveValue('saving');
      expect(within(screen.getByLabelText('Sort by')).queryByRole('option', { name: 'Market value' })).toBeNull();
    });
    it('offers All sets only on Deals, with Modern and WOTC groups', () => {
      const a = render(<FilterBar params={p()} />);
      expect(within(screen.getByLabelText('Set')).getByRole('option', { name: 'All sets' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Modern' })).toHaveTextContent('30th Celebration');
      expect(screen.getByRole('group', { name: 'WOTC' })).toHaveTextContent('Base Set');
      expect(screen.getByRole('group', { name: 'WOTC' })).not.toHaveTextContent('30th Celebration');
      a.unmount();
      render(<FilterBar params={p({ tab: 'singles' })} />);
      expect(within(screen.getByLabelText('Set')).queryByRole('option', { name: 'All sets' })).toBeNull();
      expect(screen.getByLabelText('Set')).toHaveValue('30th-celebration');
    });
    it('shows Condition for vintage sets and all sets, not for a modern set or sealed', () => {
      const cases: [Record<string, string>, boolean][] = [
        [{ tab: 'deals' }, true], [{ tab: 'deals', set: 'base-set' }, true], [{ tab: 'singles', set: 'jungle' }, true],
        [{ tab: 'deals', set: '30th-celebration' }, false], [{ tab: 'singles' }, false], [{ tab: 'sealed', set: 'jungle' }, false],
      ];
      for (const [sp, shown] of cases) {
        const { unmount } = render(<FilterBar params={p(sp)} />);
        expect(screen.queryByLabelText('Condition') !== null, JSON.stringify(sp)).toBe(shown);
        unmount();
      }
    });
    it('lists the three condition groups and defaults singles to Near Mint', () => {
      render(<FilterBar params={p({ tab: 'singles', set: 'base-set' })} />);
      const c = screen.getByLabelText('Condition');
      expect(within(c).getAllByRole('option').map((o) => o.textContent)).toEqual(['Near Mint', 'Slightly Played', 'Moderately Played']);
      expect(c).toHaveValue('nm');
    });
    it('pre-fills the selected options and carries the edition along', () => {
      const { container } = render(<FilterBar params={p({ tab: 'singles', set: 'base-set', sort: 'cheapest', condition: 'sp', rarity: ['Common', 'No rarity'], edition: 'shadowless' })} rarities={rarities} />);
      expect(screen.getByLabelText('Set')).toHaveValue('base-set');
      expect(screen.getByLabelText('Sort by')).toHaveValue('cheapest');
      expect(screen.getByLabelText('Condition')).toHaveValue('sp');
      expect(Array.from((screen.getByLabelText('Rarity') as HTMLSelectElement).selectedOptions).map((o) => o.value)).toEqual(['Common', 'No rarity']);
      expect(hidden(container, 'edition')).toHaveAttribute('value', 'shadowless');
    });
    it('hides Rarity on sealed', () => {
      render(<FilterBar params={p({ tab: 'sealed' })} rarities={rarities} />);
      expect(screen.queryByLabelText('Rarity')).toBeNull();
    });
    it('offers Clear filters for a chosen rarity', () => {
      render(<FilterBar params={p({ rarity: 'Rare' })} rarities={rarities} />);
      expect(screen.getByRole('link', { name: 'Clear filters' })).toBeInTheDocument();
    });
  });
});
