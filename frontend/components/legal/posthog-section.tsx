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
            BeastyPage verwendet derzeit PostHog zur Nutzungsanalyse.
            Auftragsverarbeiter ist PostHog, Inc., 2261 Market Street #4008, San
            Francisco, CA 94114, USA. Die Verarbeitung erfolgt über die PostHog
            EU Cloud in Frankfurt; PostHog ist unter dem EU-US Data Privacy
            Framework zertifiziert, und der Auftragsverarbeitungsvertrag enthält
            Standardvertragsklauseln.
          </p>
          <p>
            Verarbeitet werden Nutzungsereignisse, technische Verbindungsdaten
            und pseudonyme Kennungen im Browser-Speicher. Sitzungsaufzeichnungen
            finden nicht statt. Ereignisdaten werden je nach Tarif bis zu einem
            Jahr oder bis zu sieben Jahre gespeichert. Rechtsgrundlage ist Art.
            6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt darin, die
            Nutzung zu verstehen und die Website zu verbessern.
          </p>
          <p>
            Sie können nach Art. 21 DSGVO widersprechen und den Browser-Speicher
            für diese Website blockieren. Eine Einwilligung wird derzeit nicht
            eingeholt; sie ist zusammen mit der Umstellung auf ein selbst
            betriebenes Analysewerkzeug vorgesehen (siehe Abschnitt 15).
            Details:{" "}
            <a href="https://posthog.com/privacy">
              Datenschutzerklärung von PostHog
            </a>
            .
          </p>
        </>
      ) : (
        <>
          <p>
            BeastyPage currently uses PostHog for usage analytics. The processor
            is PostHog, Inc., 2261 Market Street #4008, San Francisco, CA 94114,
            USA. Processing uses PostHog EU Cloud in Frankfurt; PostHog is
            certified under the EU-US Data Privacy Framework, and its data
            processing agreement includes Standard Contractual Clauses.
          </p>
          <p>
            Data includes usage events, technical connection data and
            pseudonymous identifiers in browser storage. There is no session
            recording. Event data is retained for up to one year or up to seven
            years depending on the plan. The legal basis is Art. 6(1)(f) GDPR;
            the legitimate interest is understanding usage and improving the
            website.
          </p>
          <p>
            You can object under Art. 21 GDPR and block browser storage for this
            website. Consent is not currently collected; it is planned alongside
            the switch to a self-hosted analytics tool (see section 15).
            Details:{" "}
            <a href="https://posthog.com/privacy">PostHog privacy policy</a>.
          </p>
        </>
      )}
    </PrivacySection>
  );
}
