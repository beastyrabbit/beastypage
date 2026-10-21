import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function WikimediaSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Wikimedia Commons" : "Wikimedia Commons"}
    >
      {lang === "de" ? (
        <p>
          {
            "Nur wenn Sie die optionale Funktion „Zufallsbild“ des Farbpaletten-Erstellers nutzen, lädt Ihr Browser Daten von Wikimedia Commons. Anbieter ist die Wikimedia Foundation, Inc., 1 Sansome Street, Suite 1895, San Francisco, CA 94104, USA, als eigenständiger Verantwortlicher. Dabei werden Ihre IP-Adresse und Browserdaten verarbeitet, auch in den USA. Eine DPF-Zertifizierung oder ein konkreter anderer Übermittlungsmechanismus konnte nicht verifiziert werden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse ist die Bereitstellung der von Ihnen angeforderten Funktion. Die Speicherung richtet sich nach den Angaben des Anbieters: "
          }
          <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy/en">
            {"Datenschutzerklärung von Wikimedia"}
          </a>
          {"."}
        </p>
      ) : (
        <p>
          {
            "Only when you use the optional random-image feature of the colour-palette creator does your browser load data from Wikimedia Commons. The provider is the Wikimedia Foundation, Inc., 1 Sansome Street, Suite 1895, San Francisco, CA 94104, USA, as an independent controller. Your IP address and browser data are processed, including in the USA. No DPF certification or specific alternative transfer mechanism could be verified. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is providing the feature you requested. Retention follows the provider's policy: "
          }
          <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy/en">
            {"Wikimedia privacy policy"}
          </a>
          {"."}
        </p>
      )}
    </PrivacySection>
  );
}
