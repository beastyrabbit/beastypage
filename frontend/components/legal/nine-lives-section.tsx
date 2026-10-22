import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function NineLivesSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection number={number} title="Nine Lives">
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
          {
            ". Das eingebettete Spiel zeigt kein eigenes Cookie-Banner und folgt Ihrer Analytics-Wahl in den „Cookie settings“ von BeastyPage, wo Sie sie ändern oder widerrufen können."
          }
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
          {
            '. The embedded game shows no consent banner of its own and follows your analytics choice in BeastyPage\'s "Cookie settings", where you can change or withdraw it.'
          }
        </p>
      )}
    </PrivacySection>
  );
}
