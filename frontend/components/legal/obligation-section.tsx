import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function ObligationSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de"
          ? "Pflicht zur Bereitstellung"
          : "Obligation to provide data"
      }
    >
      {lang === "de" ? (
        <p>
          {
            "Sie sind nicht verpflichtet, personenbezogene Daten bereitzustellen. Ohne die technisch notwendigen Verbindungsdaten kann die Website jedoch nicht ausgeliefert werden, und ohne Anmeldung sind die kontobezogenen Funktionen nicht nutzbar."
          }
        </p>
      ) : (
        <p>
          {
            "You are not obliged to provide personal data. However, the website cannot be delivered without the technically necessary connection data, and account features cannot be used without signing in."
          }
        </p>
      )}
    </PrivacySection>
  );
}
