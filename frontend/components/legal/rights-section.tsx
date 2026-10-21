import { LegalEmail } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function RightsSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Ihre Rechte" : "Your rights"}
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Sie haben gegenüber dem Verantwortlichen folgende Rechte hinsichtlich Ihrer personenbezogenen Daten:"
            }
          </p>
          <ul>
            <li>{"Auskunft (Art. 15 DSGVO)"}</li>
            <li>{"Berichtigung (Art. 16 DSGVO)"}</li>
            <li>{"Löschung (Art. 17 DSGVO)"}</li>
            <li>{"Einschränkung der Verarbeitung (Art. 18 DSGVO)"}</li>
            <li>{"Datenübertragbarkeit (Art. 20 DSGVO)"}</li>
            <li>
              {
                "Widerruf einer erteilten Einwilligung (Art. 7 Abs. 3 DSGVO): Sie können eine erteilte Einwilligung jederzeit widerrufen. Die Rechtmäßigkeit der Verarbeitung vor dem Widerruf bleibt unberührt."
              }
            </li>
          </ul>
          <p>
            <strong>{"Widerspruchsrecht (Art. 21 DSGVO):"}</strong>
            {
              " Soweit eine Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO beruht, können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen."
            }
          </p>
          <p>
            {"Zur Ausübung Ihrer Rechte genügt eine Nachricht an "}
            <LegalEmail kind="privacy" />
            {"."}
          </p>
          <p>
            {
              "Sie haben außerdem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, insbesondere in dem Mitgliedstaat Ihres gewöhnlichen Aufenthalts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes (Art. 77 DSGVO)."
            }
          </p>
        </>
      ) : (
        <>
          <p>{"You have the following rights regarding your personal data:"}</p>
          <ul>
            <li>{"access (Art. 15 GDPR)"}</li>
            <li>{"rectification (Art. 16 GDPR)"}</li>
            <li>{"erasure (Art. 17 GDPR)"}</li>
            <li>{"restriction of processing (Art. 18 GDPR)"}</li>
            <li>{"data portability (Art. 20 GDPR)"}</li>
            <li>
              {
                "withdrawal of consent (Art. 7(3) GDPR): you may withdraw consent at any time. Withdrawal does not affect the lawfulness of processing before withdrawal."
              }
            </li>
          </ul>
          <p>
            <strong>{"Right to object (Art. 21 GDPR):"}</strong>
            {
              " Where processing is based on Art. 6(1)(f) GDPR, you may object at any time on grounds relating to your particular situation."
            }
          </p>
          <p>
            {"To exercise your rights, simply send a message to "}
            <LegalEmail kind="privacy" />
            {"."}
          </p>
          <p>
            {
              "You also have the right to lodge a complaint with a data protection supervisory authority, in particular in the member state of your habitual residence, place of work or place of the alleged infringement (Art. 77 GDPR)."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
