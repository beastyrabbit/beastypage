import { ContactFormLink } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Kontaktformular",
    introduction:
      "Wenn Sie das Kontaktformular nutzen, werden Ihre Angaben (Name, E-Mail-Adresse, Nachricht) und der Zeitpunkt der Anfrage an das E-Mail-Postfach des Verantwortlichen gesendet, um Ihre Anfrage zu beantworten. Die Angaben werden nicht in einer Datenbank auf dem Server gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt darin, Anfragen beantworten zu können. Zum Schutz vor Spam werden ein verstecktes Feld und eine Begrenzung der Anfragen pro IP-Adresse eingesetzt; die IP-Adresse wird dafür bis zu 10 Minuten nach Ihrer letzten Anfrage nur im Arbeitsspeicher gehalten.",
    sourceBeforeParameter:
      "Wenn Sie von einer anderen Website über den Parameter ",
    sourceBeforeLink:
      " kommen, wird nur deren zugelassener Kurzname zum Betreff hinzugefügt. Das Formular ist unter ",
    sourceAfterLink: " erreichbar.",
    delivery:
      "Der Versand erfolgt über den E-Mail-Dienst Resend der Plus Five Five, Inc., 2261 Market Street #5039, San Francisco, CA 94114, USA, als Auftragsverarbeiter (Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO als Teil der Nutzungsbedingungen). Resend speichert Inhalt und Metadaten der Nachricht (Absender, Empfänger, Betreff, Text) sowie Protokolldaten in den USA und löscht sie nach 30 Tagen; Sicherungskopien bei Resend werden nach 7 Tagen gelöscht. Die Übermittlung in die USA erfolgt auf Grundlage des EU-US Data Privacy Framework, unter dem der Anbieter zertifiziert ist, sowie der Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Details: ",
    privacyLabel: "Datenschutzerklärung von Resend",
    mailbox:
      "Das Postfach wird bei Fastmail betrieben (siehe nächster Abschnitt), dort gelten auch die Angaben zur Löschung.",
  },
  en: {
    title: "Contact form",
    introduction:
      "If you use the contact form, the details you enter (name, e-mail address, message) and the time of the request are sent to the controller's mailbox so your request can be answered. They are not stored in a database on the server. The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is being able to answer requests. To prevent spam, a hidden field and a limit on requests per IP address are used; the IP address is held only in memory until 10 minutes after your last request.",
    sourceBeforeParameter: "If you arrive from another website through the ",
    sourceBeforeLink:
      " parameter, only that site's permitted short name is added to the subject. The form is available at ",
    sourceAfterLink: ".",
    delivery:
      "Messages are sent through the e-mail service Resend, operated by Plus Five Five, Inc., 2261 Market Street #5039, San Francisco, CA 94114, USA, as a processor (a data processing agreement under Art. 28 GDPR forms part of the terms of service). Resend stores message content and metadata (sender, recipient, subject, text) and log data in the USA and deletes them after 30 days; Resend backups are deleted after 7 days. Transfers to the USA are based on the EU-US Data Privacy Framework, under which the provider is certified, and the European Commission's Standard Contractual Clauses (Art. 46(2)(c) GDPR). Details: ",
    privacyLabel: "Resend privacy policy",
    mailbox:
      "The mailbox is hosted by Fastmail (see next section), where the deletion information also applies.",
  },
} as const;

export function ContactSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.introduction}</p>
      <p>
        {copy.sourceBeforeParameter}
        <code>{"?from="}</code>
        {copy.sourceBeforeLink}
        <ContactFormLink />
        {copy.sourceAfterLink}
      </p>
      <p>
        {copy.delivery}
        <a href="https://resend.com/legal/privacy-policy">
          {copy.privacyLabel}
        </a>
        {"."}
      </p>
      <p>{copy.mailbox}</p>
    </PrivacySection>
  );
}
