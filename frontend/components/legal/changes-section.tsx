import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function ChangesSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Änderungen" : "Changes"}
    >
      {lang === "de" ? (
        <p>
          {
            "Diese Datenschutzerklärung wird angepasst, wenn sich die Website oder die Rechtslage ändert. Es gilt die jeweils hier veröffentlichte Fassung."
          }
        </p>
      ) : (
        <p>
          {
            "This privacy policy is updated when the website or the legal situation changes. The version published here applies."
          }
        </p>
      )}
    </PrivacySection>
  );
}
