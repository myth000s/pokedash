// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteFooter } from './SiteFooter';

describe('SiteFooter', () => {
  it('links to Impressum and Datenschutz', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: 'Impressum' }).getAttribute('href')).toBe('/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' }).getAttribute('href')).toBe('/datenschutz');
  });
  it('marks the German links and hides the separator', () => {
    const { container } = render(<SiteFooter />);
    expect(screen.getByRole('link', { name: 'Impressum' }).getAttribute('lang')).toBe('de');
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('·');
  });
});
