import { LegalEmail } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function EmailSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Kontakt per E-Mail" : "Contact by e-mail"}
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Wenn Sie per E-Mail Kontakt aufnehmen, werden Ihre E-Mail-Adresse, der Inhalt Ihrer Nachricht und die technischen Angaben der E-Mail verarbeitet, um Ihre Anfrage zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt darin, Anfragen beantworten zu können."
            }
          </p>
          <p>
            {
              "Die E-Mail-Postfächer werden bei der Fastmail Pty Ltd, PO Box 234, Collins Street West, VIC 8007, Australien, als Auftragsverarbeiter betrieben. Dabei können Daten in Länder außerhalb der EU übermittelt werden, insbesondere nach Australien, in die USA und nach Indien. Für diese Übermittlungen verwendet Fastmail Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Details: "
            }
            <a href="https://www.fastmail.com/policies/privacy/">
              {"Datenschutzerklärung von Fastmail"}
            </a>
            {", "}
            <a href="https://www.fastmail.com/policies/dpa/">
              {"Auftragsverarbeitungsvertrag"}
            </a>
            {" und "}
            <a href="https://www.fastmail.com/policies/dpa/section3/">
              {"Standardvertragsklauseln"}
            </a>
            {". Eine Kopie der Garantien erhalten Sie auf Anfrage an "}
            <LegalEmail kind="privacy" />
            {"."}
          </p>
          <p>
            {
              "Der Verantwortliche löscht Nachrichten nach Erledigung der Anfrage, soweit keine Aufbewahrung erforderlich ist. Bei Fastmail können anschließend noch Sicherungs- und Protokolldaten nach dessen veröffentlichten Löschregeln verbleiben."
            }
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "If you contact us by e-mail, your e-mail address, the content of your message and the technical details of the e-mail are processed to answer your request. The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is being able to answer requests."
            }
          </p>
          <p>
            {
              "The mailboxes are hosted by Fastmail Pty Ltd, PO Box 234, Collins Street West, VIC 8007, Australia, as a processor. Data may be transferred to countries outside the EU, in particular Australia, the USA and India. For these transfers, Fastmail uses the European Commission's Standard Contractual Clauses (Art. 46(2)(c) GDPR). Details: "
            }
            <a href="https://www.fastmail.com/policies/privacy/">
              {"Fastmail privacy policy"}
            </a>
            {", "}
            <a href="https://www.fastmail.com/policies/dpa/">
              {"data processing agreement"}
            </a>
            {" and "}
            <a href="https://www.fastmail.com/policies/dpa/section3/">
              {"Standard Contractual Clauses"}
            </a>
            {". You can obtain a copy of the safeguards by writing to "}
            <LegalEmail kind="privacy" />
            {"."}
          </p>
          <p>
            {
              "The controller deletes messages after dealing with the request unless retention remains necessary. Fastmail may subsequently retain backup and log data under its published deletion rules."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
