import { LegalEmail } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Kontakt per E-Mail",
    introduction:
      "Wenn Sie per E-Mail Kontakt aufnehmen, werden Ihre E-Mail-Adresse, der Inhalt Ihrer Nachricht und die technischen Angaben der E-Mail verarbeitet, um Ihre Anfrage zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt darin, Anfragen beantworten zu können.",
    provider:
      "Die E-Mail-Postfächer werden bei der Fastmail Pty Ltd, PO Box 234, Collins Street West, VIC 8007, Australien, als Auftragsverarbeiter betrieben. Dabei können Daten in Länder außerhalb der EU übermittelt werden, insbesondere nach Australien, in die USA und nach Indien. Für diese Übermittlungen verwendet Fastmail Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Details: ",
    privacyLabel: "Datenschutzerklärung von Fastmail",
    agreementLabel: "Auftragsverarbeitungsvertrag",
    linkConjunction: " und ",
    clausesLabel: "Standardvertragsklauseln",
    guarantees: ". Eine Kopie der Garantien erhalten Sie auf Anfrage an ",
    retention:
      "Der Verantwortliche löscht Nachrichten nach Erledigung der Anfrage, soweit keine Aufbewahrung erforderlich ist. Bei Fastmail können anschließend noch Sicherungs- und Protokolldaten nach dessen veröffentlichten Löschregeln verbleiben.",
  },
  en: {
    title: "Contact by e-mail",
    introduction:
      "If you contact us by e-mail, your e-mail address, the content of your message and the technical details of the e-mail are processed to answer your request. The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is being able to answer requests.",
    provider:
      "The mailboxes are hosted by Fastmail Pty Ltd, PO Box 234, Collins Street West, VIC 8007, Australia, as a processor. Data may be transferred to countries outside the EU, in particular Australia, the USA and India. For these transfers, Fastmail uses the European Commission's Standard Contractual Clauses (Art. 46(2)(c) GDPR). Details: ",
    privacyLabel: "Fastmail privacy policy",
    agreementLabel: "data processing agreement",
    linkConjunction: " and ",
    clausesLabel: "Standard Contractual Clauses",
    guarantees: ". You can obtain a copy of the safeguards by writing to ",
    retention:
      "The controller deletes messages after dealing with the request unless retention remains necessary. Fastmail may subsequently retain backup and log data under its published deletion rules.",
  },
} as const;

export function EmailSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.introduction}</p>
      <p>
        {copy.provider}
        <a href="https://www.fastmail.com/policies/privacy/">
          {copy.privacyLabel}
        </a>
        {", "}
        <a href="https://www.fastmail.com/policies/dpa/">
          {copy.agreementLabel}
        </a>
        {copy.linkConjunction}
        <a href="https://www.fastmail.com/policies/dpa/section3/">
          {copy.clausesLabel}
        </a>
        {copy.guarantees}
        <LegalEmail kind="privacy" />
        {"."}
      </p>
      <p>{copy.retention}</p>
    </PrivacySection>
  );
}
