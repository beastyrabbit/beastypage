import { LegalEmail } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Clerk (Anmeldung)",
    provider:
      "Clerk, Inc., 660 King Street Unit 345, San Francisco, CA 94107, USA, wird als Auftragsverarbeiter für die technisch notwendige Anmeldung und Kontoverwaltung eingesetzt. Clerk verarbeitet Anmelde-, Konto- und Sicherheitsdaten und erhält bereits beim Laden öffentlicher Seiten IP-Adresse und Browserdaten. Die Verarbeitung erfolgt in den USA; Clerk ist unter dem EU-US Data Privacy Framework zertifiziert, und der Auftragsverarbeitungsvertrag enthält Standardvertragsklauseln. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für Anmeldung und Konto sowie Art. 6 Abs. 1 lit. f DSGVO für die Bereitstellung und Absicherung der Anmeldung.",
    retentionBeforeEmail:
      "Für die Speicherung von Kontodaten gelten die Fristen in Abschnitt 6. Sie können die Löschung unter ",
    retentionAfterEmail:
      " anfordern. Dann werden sowohl das Clerk-Konto als auch die bei BeastyPage gespeicherten Daten gelöscht. Details: ",
    privacyLabel: "Datenschutzerklärung von Clerk",
    turnstile:
      "Bei der Registrierung kann Clerk zur Abwehr von Bots Cloudflare Turnstile einsetzen, wobei IP-Adresse und Browserdaten verarbeitet werden (Art. 6 Abs. 1 lit. f DSGVO; ",
    turnstilePrivacyLabel: "Datenschutzerklärung von Cloudflare",
  },
  en: {
    title: "Clerk (authentication)",
    provider:
      "Clerk, Inc., 660 King Street Unit 345, San Francisco, CA 94107, USA, is used as a processor for technically necessary sign-in and account management. Clerk processes sign-in, account and security data and receives IP addresses and browser data when public pages load. Processing takes place in the USA; Clerk is certified under the EU-US Data Privacy Framework, and its data processing agreement includes Standard Contractual Clauses. The legal basis is Art. 6(1)(b) GDPR for sign-in and accounts, and Art. 6(1)(f) GDPR for providing and securing sign-in.",
    retentionBeforeEmail:
      "The retention periods in section 6 apply to account data. You can request deletion at ",
    retentionAfterEmail:
      ". Both the Clerk account and the data stored in BeastyPage are then deleted. Details: ",
    privacyLabel: "Clerk privacy policy",
    turnstile:
      "During registration, Clerk may use Cloudflare Turnstile to prevent bots, processing IP addresses and browser data (Art. 6(1)(f) GDPR; ",
    turnstilePrivacyLabel: "Cloudflare privacy policy",
  },
} as const;

export function ClerkSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.provider}</p>
      <p>
        {copy.retentionBeforeEmail}
        <LegalEmail kind="privacy" />
        {copy.retentionAfterEmail}
        <a href="https://clerk.com/legal/privacy">{copy.privacyLabel}</a>
        {"."}
      </p>
      <p>
        {copy.turnstile}
        <a href="https://www.cloudflare.com/privacypolicy/">
          {copy.turnstilePrivacyLabel}
        </a>
        {")."}
      </p>
    </PrivacySection>
  );
}
