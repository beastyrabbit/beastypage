import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function ImageUrlsSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de"
          ? "Bilder von eingegebenen Adressen"
          : "Images from addresses you enter"
      }
    >
      {lang === "de" ? (
        <p>
          {
            "Wenn Sie eine Bildadresse eingeben, lädt Ihr Browser das Bild vom angegebenen Server. Dessen Betreiber erhält dabei Ihre IP-Adresse und Browserdaten und verarbeitet diese eigenverantwortlich nach seinen Datenschutzhinweisen. Empfänger, Verarbeitungsort und Speicherdauer hängen von der gewählten Adresse ab. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse ist das Laden des von Ihnen angeforderten Bildes."
          }
        </p>
      ) : (
        <p>
          {
            "If you enter an image URL, your browser loads the image from that server. Its operator receives your IP address and browser data and processes it under its own responsibility according to its privacy policy. The recipient, processing location and retention depend on the address you choose. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is loading the image you requested."
          }
        </p>
      )}
    </PrivacySection>
  );
}
