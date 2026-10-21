import type { Metadata } from 'next';
import { LegalPanel } from '@/components/LegalPanel';
import { getImprint, IMPRINT_PLACEHOLDER } from '@/config/imprint';

export const metadata: Metadata = { title: 'Datenschutz · pokedash' };

export default function DatenschutzPage() {
  const i = getImprint();
  const email =
    i.email === IMPRINT_PLACEHOLDER ? i.email : <a href={`mailto:${i.email}`}>{i.email}</a>;
  return (
    <LegalPanel title="Datenschutzerklärung">
      <h2>1. Verantwortlicher</h2>
      <p>
        {i.name}, {i.street}, {i.postalCity}
        <br />
        E-Mail: {email}
      </p>

      <h2>2. Überblick</h2>
      <p>
        pokedash ist ein privater Dienst für eingeladene Nutzerinnen und Nutzer. Es gibt kein
        Tracking, keine Webanalyse und keine Werbung. Es werden keine Skripte von Dritten
        eingebunden.
      </p>
      <p>
        Die Bereitstellung deiner Daten ist weder gesetzlich noch vertraglich vorgeschrieben.
        Ohne E-Mail-Adresse und Passwort kann aber kein Konto genutzt werden. Eine automatisierte
        Entscheidungsfindung einschließlich Profiling findet nicht statt.
      </p>

      <h2>3. Hosting (Vercel)</h2>
      <p>
        Die Anwendung wird bei Vercel Inc., USA, gehostet; die Serverfunktionen laufen in
        Frankfurt am Main (Region fra1). Beim Aufruf fallen in Server-Logfiles technisch
        notwendige Daten an, darunter die IP-Adresse. Sie dienen der Auslieferung und der
        Sicherheit der Seite. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
        Interesse an einem sicheren und stabilen Betrieb). Vercel ist unter dem EU-US Data
        Privacy Framework zertifiziert; mit Vercel besteht ein Auftragsverarbeitungsvertrag.
      </p>

      <h2>4. Datenbank und Anmeldung (Supabase)</h2>
      <p>
        Konten und Anmeldung laufen über Supabase, Inc. (USA); die Daten liegen in der Region
        Irland (eu-west-1, EU). Konten lege ausschließlich ich an, eine Selbstregistrierung
        gibt es nicht. Die Anmeldung erfolgt mit E-Mail-Adresse, Passwort und einem Code aus
        einer Authenticator-App. Gespeichert werden:
      </p>
      <ul>
        <li>E-Mail-Adresse (nur als Anmeldename; pokedash versendet keine E-Mails)</li>
        <li>Passwort-Hash</li>
        <li>Authenticator-Faktor (TOTP)</li>
        <li>Sitzungsdaten</li>
      </ul>
      <p>
        Rechtsgrundlage dafür ist Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung des Dienstes für
        eingeladene Nutzerinnen und Nutzer).
      </p>
      <p>
        Bei der Anmeldung und während du angemeldet bist, verarbeitet Supabase außerdem deine
        IP-Adresse und Browser-Informationen (User-Agent). Das geschieht in Sitzungsdatensätzen,
        im Audit-Log der Anmeldung und in Server-Logs (Speicherdauer siehe Abschnitt 9). Zweck
        ist die Absicherung der Anmeldung; Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das
        berechtigte Interesse liegt in der Sicherheit des Dienstes und im Schutz der Konten vor
        unbefugtem Zugriff.
      </p>
      <p>
        Mit Supabase besteht ein Auftragsverarbeitungsvertrag mit
        EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO). Er sichert einen möglichen
        Zugriff aus den USA ab.
      </p>

      <h2>5. Cookies</h2>
      <p>
        pokedash setzt ausschließlich technisch notwendige Cookies für die Anmeldung (HTTP-only
        Supabase-Sitzungscookies). Sie bleiben bis zur Abmeldung in deinem Browser gespeichert,
        höchstens 400 Tage nach der letzten Nutzung. Die Sitzung auf dem Server endet aber schon
        nach 30 Tagen ohne Aktivität; danach musst du dich neu anmelden. Diese Cookies sind nach § 25 Abs. 2 Nr. 2
        TDDDG ohne Einwilligung zulässig, daher gibt es kein Cookie-Banner.
      </p>

      <h2>6. Kartenbilder</h2>
      <p>
        Kartenbilder von CardTrader ruft der pokedash-Server ab und liefert sie über die eigene
        Domain aus. Dein Browser baut keine Verbindung zu CardTrader auf.
      </p>

      <h2>7. Schriftarten</h2>
      <p>
        Die Schriftarten Russo One und Chakra Petch werden lokal von der eigenen Domain
        ausgeliefert. Es besteht keine Verbindung zu Google.
      </p>

      <h2>8. Marktdaten</h2>
      <p>
        Die angezeigten Preise stammen aus dem öffentlichen Preisführer von Cardmarket, von
        CardTrader und PokemonPriceTracker sowie aus dem Wechselkurs der Europäischen Zentralbank.
        Ein zeitgesteuerter Job bei GitHub Actions ruft sie ab. Sie enthalten keine
        personenbezogenen Daten der Nutzerinnen und Nutzer.
      </p>

      <h2>9. Speicherdauer</h2>
      <p>Ein Konto bleibt bestehen, bis ich es auf deinen Wunsch lösche. Für die übrigen Daten gilt:</p>
      <ul>
        <li>Anmelde-Cookies: bis zur Abmeldung, höchstens 400 Tage nach der letzten Nutzung.</li>
        <li>
          Sitzungen auf dem Server (mit IP-Adresse und User-Agent): Sie enden mit der Abmeldung;
          nach 30 Tagen ohne Aktivität werden sie gelöscht.
        </li>
        <li>Audit-Log der Anmeldung (mit IP-Adresse): Einträge werden nach 30 Tagen gelöscht.</li>
        <li>
          Server-Logs bei Vercel und Supabase: nach den Aufbewahrungsfristen der jeweiligen
          Anbieter.
        </li>
      </ul>
      <p>Ein automatischer Lauf führt diese Löschungen einmal täglich durch.</p>

      <h2>10. Rechte</h2>
      <p>
        Du hast nach Art. 15 bis 21 DSGVO das Recht auf Auskunft, Berichtigung, Löschung,
        Einschränkung der Verarbeitung und Datenübertragbarkeit. Wende dich dazu an die oben
        genannte E-Mail-Adresse.
      </p>
      <h3>Widerspruchsrecht (Art. 21 DSGVO)</h3>
      <p>
        Du hast das Recht, aus Gründen, die sich aus deiner besonderen Situation ergeben,
        jederzeit gegen die Verarbeitung deiner Daten, die auf Art. 6 Abs. 1 lit. f DSGVO
        beruht, Widerspruch einzulegen. Dann verarbeite ich die Daten nicht mehr, es sei denn,
        ich kann zwingende schutzwürdige Gründe dafür nachweisen, die deine Interessen, Rechte
        und Freiheiten überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder
        Verteidigung von Rechtsansprüchen.
      </p>

      <h2>11. Beschwerderecht</h2>
      <p>
        Du hast nach Art. 77 DSGVO das Recht, dich bei einer Aufsichtsbehörde zu beschweren.
        Zuständig ist:
        <br />
        Der Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover
      </p>

      <h2>12. Stand</h2>
      <p>Oktober 2026</p>
    </LegalPanel>
  );
}
