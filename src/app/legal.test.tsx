// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImpressumPage from './impressum/page';
import DatenschutzPage from './datenschutz/page';

beforeEach(() => {
  vi.stubEnv('IMPRINT_NAME', 'Erika Muster');
  vi.stubEnv('IMPRINT_STREET', 'Beispielweg 1');
  vi.stubEnv('IMPRINT_POSTAL_CITY', '12345 Musterstadt');
  vi.stubEnv('IMPRINT_EMAIL', 'kontakt@example.org');
});
afterEach(() => vi.unstubAllEnvs());

describe('Impressum', () => {
  it('shows the imprint details', () => {
    render(<ImpressumPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeTruthy();
    expect(screen.getAllByText(/Erika Muster/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12345 Musterstadt/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'kontakt@example.org' }).getAttribute('href')).toBe(
      'mailto:kontakt@example.org',
    );
  });
});

describe('unconfigured email', () => {
  it('renders plain text instead of a mailto link', () => {
    vi.stubEnv('IMPRINT_EMAIL', '  ');
    for (const Page of [ImpressumPage, DatenschutzPage]) {
      const { container, unmount } = render(<Page />);
      expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(container.textContent).toContain('[nicht konfiguriert]');
      unmount();
    }
  });
});

describe('Datenschutz', () => {
  it('has the required sections', () => {
    render(<DatenschutzPage />);
    for (const h of ['Verantwortlicher', 'Hosting', 'Cookies', 'Beschwerderecht']) {
      expect(screen.getByRole('heading', { name: new RegExp(h) })).toBeTruthy();
    }
    expect(screen.getByText(/Der Landesbeauftragte für den Datenschutz Niedersachsen/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Art\. 21/ })).toBeTruthy();
    expect(screen.getAllByText(/Erika Muster/).length).toBeGreaterThan(0);
  });
  it('states the retention of cookies, sessions and the login audit log', () => {
    const { container } = render(<DatenschutzPage />);
    const text = container.textContent!.replace(/\s+/g, ' ');
    // supabase/maintenance/auth-retention.sql enforces the two 30-day periods.
    expect(text).toContain('Anmelde-Cookies: bis zur Abmeldung, höchstens 400 Tage nach der letzten Nutzung.');
    expect(text).toMatch(/Sitzungen auf dem Server \(mit IP-Adresse und User-Agent\): Sie enden mit der Abmeldung; nach 30 Tagen ohne Aktivität werden sie gelöscht\./);
    expect(text).toContain('Audit-Log der Anmeldung (mit IP-Adresse): Einträge werden nach 30 Tagen gelöscht.');
    expect(text).toContain('Server-Logs bei Vercel und Supabase: nach den Aufbewahrungsfristen der jeweiligen Anbieter.');
    expect(text).toContain('höchstens 400 Tage nach der letzten Nutzung. Die Sitzung auf dem Server endet aber schon nach 30 Tagen ohne Aktivität');
  });
  it('keeps compound words whole across source line breaks', () => {
    const { container } = render(<DatenschutzPage />);
    expect(container.textContent).toContain('EU-Standardvertragsklauseln');
    // A JSX line break after a hyphen renders as "EU- Standard…"; "Sitzungs- und" stays allowed.
    expect(container.textContent).not.toMatch(/\w- [A-ZÄÖÜ]/);
  });
});
