import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function OptionalRequestsSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de"
          ? "Optionale Funktionen mit externen Abrufen"
          : "Optional features with external requests"
      }
    >
      {lang === "de" ? (
        <>
          <h3>Wikimedia Commons</h3>
          <p>
            Die optionale Zufallsbild-Funktion des Farbpaletten-Erstellers lädt
            Daten von Wikimedia Commons. Die Wikimedia Foundation, Inc., 1
            Sansome Street, Suite 1895, San Francisco, CA 94104, USA, erhält
            dabei als eigenständiger Verantwortlicher Ihre IP-Adresse und
            Browserdaten, auch in den USA. Ein konkreter
            Übermittlungsmechanismus konnte nicht verifiziert werden. Die
            Speicherung richtet sich nach der{" "}
            <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy/en">
              Datenschutzerklärung von Wikimedia
            </a>
            .
          </p>
          <h3>Bilder von eingegebenen Adressen</h3>
          <p>
            Wenn Sie eine Bildadresse eingeben, lädt Ihr Browser das Bild vom
            angegebenen Server. Dessen Betreiber erhält Ihre IP-Adresse und
            Browserdaten. Empfänger, Verarbeitungsort und Speicherdauer hängen
            von der gewählten Adresse und den Datenschutzhinweisen des
            Betreibers ab.
          </p>
          <h3>The Color API</h3>
          <p>
            Der Palettengenerator und der Farbpaletten-Ersteller senden
            Farbwerte (Hex-Codes) aus Ihrem Browser an The Color API (
            <a href="https://www.thecolorapi.com">thecolorapi.com</a>), um
            Farbnamen und Farbschemata abzufragen. Ihre IP-Adresse und
            Browserdaten gelangen dabei an den Anbieter. Nähere Angaben zum
            Betreiber und zu Übermittlungsgarantien liegen derzeit nicht vor.
          </p>
          <p>
            Rechtsgrundlage für diese externen Abrufe ist Art. 6 Abs. 1 lit. f
            DSGVO; das berechtigte Interesse liegt in der Bereitstellung der von
            Ihnen genutzten Funktion.
          </p>
        </>
      ) : (
        <>
          <h3>Wikimedia Commons</h3>
          <p>
            The optional random-image feature of the colour-palette creator
            loads data from Wikimedia Commons. The Wikimedia Foundation, Inc., 1
            Sansome Street, Suite 1895, San Francisco, CA 94104, USA, receives
            your IP address and browser data as an independent controller,
            including in the USA. A specific transfer mechanism could not be
            verified. Retention follows the{" "}
            <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy/en">
              Wikimedia privacy policy
            </a>
            .
          </p>
          <h3>Images from addresses you enter</h3>
          <p>
            If you enter an image URL, your browser loads the image from that
            server. Its operator receives your IP address and browser data. The
            recipient, processing location and retention depend on the address
            you choose and the operator's privacy policy.
          </p>
          <h3>The Color API</h3>
          <p>
            The palette generator and the colour-palette creator send colour
            values (hex codes) from your browser to The Color API (
            <a href="https://www.thecolorapi.com">thecolorapi.com</a>) to look
            up colour names and schemes. Your IP address and browser data reach
            the provider. Further details on the operator and transfer
            safeguards are not currently available.
          </p>
          <p>
            The legal basis for these external requests is Art. 6(1)(f) GDPR;
            the legitimate interest is providing the feature you use.
          </p>
        </>
      )}
    </PrivacySection>
  );
}
