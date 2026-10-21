import { describe, it, expect } from 'vitest';
import { getImprint } from './imprint';

describe('getImprint', () => {
  it('reads and trims the imprint from env', () =>
    expect(
      getImprint({
        IMPRINT_NAME: ' Erika Muster ',
        IMPRINT_STREET: 'Beispielweg 1',
        IMPRINT_POSTAL_CITY: '12345 Musterstadt',
        IMPRINT_EMAIL: 'kontakt@example.org',
      }),
    ).toEqual({
      name: 'Erika Muster',
      street: 'Beispielweg 1',
      postalCity: '12345 Musterstadt',
      email: 'kontakt@example.org',
    }));
  it('uses a placeholder for missing values', () =>
    expect(getImprint({ IMPRINT_NAME: '  ' }).name).toBe('[nicht konfiguriert]'));
});
