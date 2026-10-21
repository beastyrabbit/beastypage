import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function PostHogSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de" ? "PostHog (Nutzungsanalyse)" : "PostHog (analytics)"
      }
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "BeastyPage verwendet derzeit PostHog zur Nutzungsanalyse. Anbieter und Auftragsverarbeiter ist PostHog, Inc., 2261 Market Street #4008, San Francisco, CA 94114, USA. Anfragen werden über beastyrabbit.com ("
            }
            <code>{"/bubu"}</code>
            {
              ") an die PostHog EU Cloud in Frankfurt weitergeleitet. PostHog ist unter dem EU-US Data Privacy Framework zertifiziert; der Auftragsverarbeitungsvertrag enthält Standardvertragsklauseln."
            }
          </p>
          <p>
            {
              "Verarbeitet werden Seitenaufrufe, das Verlassen von Seiten, Klicks und Interaktionen (Autocapture), Ereignisse zur Werkzeugnutzung, Web-Vitals, pseudonyme Geräte- und Sitzungskennungen in localStorage/sessionStorage, die über den Proxy übermittelte IP-Adresse und Browserdaten. Sitzungsaufzeichnungen finden nicht statt. PostHog speichert Ereignisdaten je nach Tarif bis zu einem Jahr (kostenloser Tarif) bzw. bis zu sieben Jahre."
            }
          </p>
          <p>
            {
              "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt darin, die Nutzung zu verstehen und die Website zu verbessern. Der Zugriff auf den Browser-Speicher erfolgt derzeit ohne vorherige Einwilligung; eine Einwilligungsabfrage und die Umstellung auf ein selbst betriebenes Analysewerkzeug sind in Vorbereitung."
            }
          </p>
          <p>
            {
              "Sie können nach Art. 21 DSGVO widersprechen und den lokalen Speicher für diese Website im Browser blockieren. Die einwilligungsbedürftigen Speichereinträge sind in Abschnitt 16 aufgeführt. Details: "
            }
            <a href="https://posthog.com/privacy">
              {"Datenschutzerklärung von PostHog"}
            </a>
            {"."}
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "BeastyPage currently uses PostHog for usage analytics. The provider and processor is PostHog, Inc., 2261 Market Street #4008, San Francisco, CA 94114, USA. Requests are proxied through beastyrabbit.com ("
            }
            <code>{"/bubu"}</code>
            {
              ") to PostHog EU Cloud in Frankfurt. PostHog is certified under the EU-US Data Privacy Framework; its data processing agreement includes Standard Contractual Clauses."
            }
          </p>
          <p>
            {
              "Data includes pageviews, page leaves, clicks and interactions (autocapture), tool usage events, web vitals, pseudonymous device and session IDs in localStorage/sessionStorage, the IP address transmitted through the proxy, and browser data. There is no session recording. PostHog retains event data for up to one year on its free plan or up to seven years depending on the plan."
            }
          </p>
          <p>
            {
              "The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is understanding usage and improving the website. Browser storage is currently accessed without prior consent; a consent prompt and migration to a self-hosted analytics tool are being prepared."
            }
          </p>
          <p>
            {
              "You can object under Art. 21 GDPR and block local storage for this website in your browser. Storage entries requiring consent are listed in section 16. Details: "
            }
            <a href="https://posthog.com/privacy">{"PostHog privacy policy"}</a>
            {"."}
          </p>
        </>
      )}
    </PrivacySection>
  );
}
