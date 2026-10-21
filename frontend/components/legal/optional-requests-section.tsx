import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Optionale Funktionen mit externen Abrufen",
    wikimedia:
      "Die optionale Zufallsbild-Funktion des Farbpaletten-Erstellers lädt Daten von Wikimedia Commons. Die Wikimedia Foundation, Inc., 1 Sansome Street, Suite 1895, San Francisco, CA 94104, USA, erhält dabei als eigenständiger Verantwortlicher Ihre IP-Adresse und Browserdaten, auch in den USA. Ein konkreter Übermittlungsmechanismus konnte nicht verifiziert werden. Die Speicherung richtet sich nach der ",
    wikimediaPrivacyLabel: "Datenschutzerklärung von Wikimedia",
    imagesHeading: "Bilder von eingegebenen Adressen",
    images:
      "Wenn Sie eine Bildadresse eingeben, lädt Ihr Browser das Bild vom angegebenen Server. Dessen Betreiber erhält Ihre IP-Adresse und Browserdaten. Empfänger, Verarbeitungsort und Speicherdauer hängen von der gewählten Adresse und den Datenschutzhinweisen des Betreibers ab.",
    colorApiBeforeLink:
      "Der Palettengenerator und der Farbpaletten-Ersteller senden Farbwerte (Hex-Codes) aus Ihrem Browser an The Color API (",
    colorApiAfterLink:
      "), um Farbnamen und Farbschemata abzufragen. Ihre IP-Adresse und Browserdaten gelangen dabei an den Anbieter. Nähere Angaben zum Betreiber und zu Übermittlungsgarantien liegen derzeit nicht vor.",
    basis:
      "Rechtsgrundlage für diese externen Abrufe ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der Bereitstellung der von Ihnen genutzten Funktion.",
  },
  en: {
    title: "Optional features with external requests",
    wikimedia:
      "The optional random-image feature of the colour-palette creator loads data from Wikimedia Commons. The Wikimedia Foundation, Inc., 1 Sansome Street, Suite 1895, San Francisco, CA 94104, USA, receives your IP address and browser data as an independent controller, including in the USA. A specific transfer mechanism could not be verified. Retention follows the ",
    wikimediaPrivacyLabel: "Wikimedia privacy policy",
    imagesHeading: "Images from addresses you enter",
    images:
      "If you enter an image URL, your browser loads the image from that server. Its operator receives your IP address and browser data. The recipient, processing location and retention depend on the address you choose and the operator's privacy policy.",
    colorApiBeforeLink:
      "The palette generator and the colour-palette creator send colour values (hex codes) from your browser to The Color API (",
    colorApiAfterLink:
      ") to look up colour names and schemes. Your IP address and browser data reach the provider. Further details on the operator and transfer safeguards are not currently available.",
    basis:
      "The legal basis for these external requests is Art. 6(1)(f) GDPR; the legitimate interest is providing the feature you use.",
  },
} as const;

export function OptionalRequestsSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <h3>{"Wikimedia Commons"}</h3>
      <p>
        {copy.wikimedia}
        <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy/en">
          {copy.wikimediaPrivacyLabel}
        </a>
        {"."}
      </p>
      <h3>{copy.imagesHeading}</h3>
      <p>{copy.images}</p>
      <h3>{"The Color API"}</h3>
      <p>
        {copy.colorApiBeforeLink}
        <a href="https://www.thecolorapi.com">{"thecolorapi.com"}</a>
        {copy.colorApiAfterLink}
      </p>
      <p>{copy.basis}</p>
    </PrivacySection>
  );
}
