import { LegalEmail, OperatorAddress } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function ControllerSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Verantwortlicher" : "Controller"}
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Verantwortlich für die Verarbeitung personenbezogener Daten auf beastyrabbit.com ist:"
            }
          </p>
          <OperatorAddress lang={lang} />
          <p>
            {"E-Mail: "}
            <LegalEmail kind="privacy" />
          </p>
          <p>
            {
              "Ein Datenschutzbeauftragter ist nicht bestellt, da hierzu keine gesetzliche Pflicht besteht."
            }
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "The controller responsible for processing personal data on beastyrabbit.com is:"
            }
          </p>
          <OperatorAddress lang={lang} />
          <p>
            {"E-mail: "}
            <LegalEmail kind="privacy" />
          </p>
          <p>
            {
              "No data protection officer has been appointed, as there is no legal obligation to do so."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
