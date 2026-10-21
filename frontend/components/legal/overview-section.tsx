import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function OverviewSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Überblick" : "Overview"}
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Diese Erklärung informiert darüber, welche personenbezogenen Daten bei der Nutzung von BeastyPage verarbeitet werden, zu welchen Zwecken, auf welcher Rechtsgrundlage und wie lange. BeastyPage ist ein privates, nicht-kommerzielles Projekt. Freiwillige Unterstützung über Ko-fi ist möglich; dafür gibt es keine Gegenleistung. BeastyPage bietet Generatoren, Werkzeuge und kleine Spiele rund um Pixel-Katzen (auf Basis der ClanGen-Sprites), darunter Werkzeuge für Livestreams, einen Dateifreigabe-Dienst (Quick Share) und einen Discord-Bot."
            }
          </p>
          <p>
            {
              "Personenbezogene Daten werden nicht verkauft und nicht für Werbung verwendet. Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht statt."
            }
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "This policy explains which personal data is processed when you use BeastyPage, for what purposes, on which legal basis, and for how long. BeastyPage is a private, non-commercial project. Voluntary support via Ko-fi is possible; nothing is offered in return. BeastyPage offers generators, tools and small games about pixel cats (based on ClanGen sprites), including livestream tools, a file-sharing service (Quick Share) and a Discord bot."
            }
          </p>
          <p>
            {
              "Personal data is not sold and not used for advertising. There is no automated decision-making, including profiling, within the meaning of Art. 22 GDPR."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
