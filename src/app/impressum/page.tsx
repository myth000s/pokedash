import type { Metadata } from 'next';
import { LegalPanel } from '@/components/LegalPanel';
import { getImprint, IMPRINT_PLACEHOLDER } from '@/config/imprint';

export const metadata: Metadata = { title: 'Impressum · pokedash' };

export default function ImpressumPage() {
  const i = getImprint();
  const email =
    i.email === IMPRINT_PLACEHOLDER ? i.email : <a href={`mailto:${i.email}`}>{i.email}</a>;
  return (
    <LegalPanel title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {i.name}
        <br />
        {i.street}
        <br />
        {i.postalCity}
      </p>
      <h2>Kontakt</h2>
      <p>
        E-Mail: {email}
      </p>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>
        {i.name}, {i.street}, {i.postalCity}
      </p>
      <p>
        pokedash ist ein privates, nicht kommerzielles Projekt für einen kleinen, eingeladenen
        Nutzerkreis.
      </p>
    </LegalPanel>
  );
}
