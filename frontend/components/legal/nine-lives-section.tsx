import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function NineLivesSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Nine Lives" : "Nine Lives"}
    >
      {lang === "de" ? (
        <p>
          {"Die Seite "}
          <code>{"/nine-lives"}</code>
          {
            " lädt das separate Spiel von ninelives.beastyrabbit.com erst, nachdem Sie es starten. Für dessen Datenverarbeitung gilt eine eigene "
          }
          <a href="https://ninelives.beastyrabbit.com/datenschutz">
            {"Datenschutzerklärung von Nine Lives"}
          </a>
          {"."}
        </p>
      ) : (
        <p>
          {"The "}
          <code>{"/nine-lives"}</code>
          {
            " page loads the separate game from ninelives.beastyrabbit.com only after you start it. Its processing is covered by the separate "
          }
          <a href="https://ninelives.beastyrabbit.com/datenschutz">
            {"Nine Lives privacy policy"}
          </a>
          {"."}
        </p>
      )}
    </PrivacySection>
  );
}
