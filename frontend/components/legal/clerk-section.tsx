import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function ClerkSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Clerk (Anmeldung)" : "Clerk (authentication)"}
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Für Anmeldung und Kontoverwaltung wird Clerk, Inc., 660 King Street Unit 345, San Francisco, CA 94107, USA, als Auftragsverarbeiter eingesetzt. Clerk wird auf jeder Seite bereits vor der Anmeldung geladen und erhält IP-Adresse und Browserdaten. Bei Registrierung und Anmeldung verarbeitet Clerk Benutzername, Passwort, optionale E-Mail-Adresse, OAuth-Identität sowie Sitzungs- und Sicherheitsdaten."
            }
          </p>
          <p>
            {
              "Die Daten werden in den USA gehostet. Clerk ist unter dem EU-US Data Privacy Framework zertifiziert; der Auftragsverarbeitungsvertrag enthält zusätzlich Standardvertragsklauseln der EU-Kommission. Rechtsgrundlage für Anmeldung und Konto ist Art. 6 Abs. 1 lit. b DSGVO. Das Laden auf öffentlichen Seiten beruht auf Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt darin, die Anmeldung auf jeder Seite bereitzustellen und Konten zu schützen."
            }
          </p>
          <p>
            {
              "Kontodaten werden gespeichert, solange das Konto besteht. Sie können das Konto in den Kontoeinstellungen selbst löschen oder die Löschung anfordern. Clerk speichert Protokolle je nach Tarif einen, sieben oder 30 Tage. Cookies und Browser-Speicher sind in Abschnitt 16 beschrieben. Details: "
            }
            <a href="https://clerk.com/legal/privacy">
              {"Datenschutzerklärung von Clerk"}
            </a>
            {"."}
          </p>
          <p>
            {
              "Bei der Registrierung kann Clerk zum Schutz vor Bots eine Cloudflare-Turnstile-Prüfung anzeigen. Anbieter ist Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA; Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert. Dabei können IP-Adresse und Browserdaten verarbeitet werden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse ist der Schutz vor missbräuchlicher Registrierung. Details: "
            }
            <a href="https://www.cloudflare.com/privacypolicy/">
              {"Datenschutzerklärung von Cloudflare"}
            </a>
            {"."}
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "Clerk, Inc., 660 King Street Unit 345, San Francisco, CA 94107, USA, is used as a processor for sign-in and account management. Clerk loads on every page before sign-in and receives your IP address and browser data. During registration and sign-in, Clerk processes username, password, optional e-mail address, OAuth identity, and session and security data."
            }
          </p>
          <p>
            {
              "Data is hosted in the USA. Clerk is certified under the EU-US Data Privacy Framework; its data processing agreement also includes the European Commission's Standard Contractual Clauses. The legal basis for sign-in and accounts is Art. 6(1)(b) GDPR. Loading on public pages is based on Art. 6(1)(f) GDPR; the legitimate interest is making sign-in available on every page and protecting accounts."
            }
          </p>
          <p>
            {
              "Account data is stored for as long as the account exists. You can delete your account in account settings or request deletion. Clerk retains logs for one, seven or 30 days depending on the plan. Cookies and browser storage are described in section 16. Details: "
            }
            <a href="https://clerk.com/legal/privacy">
              {"Clerk privacy policy"}
            </a>
            {"."}
          </p>
          <p>
            {
              "During registration, Clerk may display a Cloudflare Turnstile challenge for bot protection. The provider is Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA; Cloudflare is certified under the EU-US Data Privacy Framework. IP address and browser data may be processed. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is preventing abusive registrations. Details: "
            }
            <a href="https://www.cloudflare.com/privacypolicy/">
              {"Cloudflare privacy policy"}
            </a>
            {"."}
          </p>
        </>
      )}
    </PrivacySection>
  );
}
