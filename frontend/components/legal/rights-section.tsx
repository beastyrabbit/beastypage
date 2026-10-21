import { LegalEmail } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Ihre Rechte",
    introduction:
      "Sie haben gegenüber dem Verantwortlichen folgende Rechte hinsichtlich Ihrer personenbezogenen Daten:",
    rights: [
      "Auskunft (Art. 15 DSGVO)",
      "Berichtigung (Art. 16 DSGVO)",
      "Löschung (Art. 17 DSGVO)",
      "Einschränkung der Verarbeitung (Art. 18 DSGVO)",
      "Datenübertragbarkeit (Art. 20 DSGVO)",
      "Widerruf einer erteilten Einwilligung (Art. 7 Abs. 3 DSGVO): Sie können eine erteilte Einwilligung jederzeit widerrufen. Die Rechtmäßigkeit der Verarbeitung vor dem Widerruf bleibt unberührt.",
    ],
    objectionHeading: "Widerspruchsrecht (Art. 21 DSGVO):",
    objection:
      " Soweit eine Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO beruht, können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen.",
    contact: "Zur Ausübung Ihrer Rechte genügt eine Nachricht an ",
    complaint:
      "Sie haben außerdem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, insbesondere in dem Mitgliedstaat Ihres gewöhnlichen Aufenthalts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes (Art. 77 DSGVO).",
  },
  en: {
    title: "Your rights",
    introduction: "You have the following rights regarding your personal data:",
    rights: [
      "access (Art. 15 GDPR)",
      "rectification (Art. 16 GDPR)",
      "erasure (Art. 17 GDPR)",
      "restriction of processing (Art. 18 GDPR)",
      "data portability (Art. 20 GDPR)",
      "withdrawal of consent (Art. 7(3) GDPR): you may withdraw consent at any time. Withdrawal does not affect the lawfulness of processing before withdrawal.",
    ],
    objectionHeading: "Right to object (Art. 21 GDPR):",
    objection:
      " Where processing is based on Art. 6(1)(f) GDPR, you may object at any time on grounds relating to your particular situation.",
    contact: "To exercise your rights, simply send a message to ",
    complaint:
      "You also have the right to lodge a complaint with a data protection supervisory authority, in particular in the member state of your habitual residence, place of work or place of the alleged infringement (Art. 77 GDPR).",
  },
} as const;

export function RightsSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.introduction}</p>
      <ul>
        {copy.rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p>
        <strong>{copy.objectionHeading}</strong>
        {copy.objection}
      </p>
      <p>
        {copy.contact}
        <LegalEmail kind="privacy" />
        {"."}
      </p>
      <p>{copy.complaint}</p>
    </PrivacySection>
  );
}
