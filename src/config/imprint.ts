export interface Imprint {
  name: string;
  street: string;
  postalCity: string;
  email: string;
}

export const IMPRINT_PLACEHOLDER = '[nicht konfiguriert]';

function pick(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : IMPRINT_PLACEHOLDER;
}

// The owner's details come from the environment only and are never stored in the repo.
// The legal pages prerender, so these are read at build time.
export function getImprint(env: Record<string, string | undefined> = process.env): Imprint {
  return {
    name: pick(env.IMPRINT_NAME),
    street: pick(env.IMPRINT_STREET),
    postalCity: pick(env.IMPRINT_POSTAL_CITY),
    email: pick(env.IMPRINT_EMAIL),
  };
}
