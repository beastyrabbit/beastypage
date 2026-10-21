import { LegalEmail } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Nutzerkonto und Inhalte",
    accountHeading: "Nutzerkonto",
    account:
      "Für Ihr Konto speichert BeastyPage Ihre Clerk-ID und Ihren Benutzernamen, der aus Ihrem Namen oder Ihrer E-Mail-Adresse abgeleitet sein kann, sowie Einstellungen und einen API-Schlüssel für Stream-Werkzeuge. Die Anmeldung erfolgt über Clerk (siehe Abschnitt 7).",
    contentHeading: "Erstellte Inhalte",
    content:
      "Gespeichert werden Einstellungen, Katzen, Stammbäume, Catdex-Einträge, Spiel- und Abstimmungsdaten sowie Stream-Sitzungen. Öffentliche oder geteilte Inhalte sind für andere sichtbar. Hochgeladene Bilder werden so gespeichert, wie sie hochgeladen wurden, einschließlich ihrer Metadaten.",
    quickShare:
      "Quick Share verarbeitet Dateien, Dateinamen und IP-Adressen zur Dateifreigabe und zum Schutz vor Missbrauch. Links laufen nach 1–30 Tagen ab. Dateien und IP-Adressen werden nach 30 Tagen gelöscht.",
    discordHeading: "Discord-Bot",
    discord:
      "Der Discord-Bot verarbeitet Ihre Discord-ID und Einstellungen. Ihr Anzeigename wird als öffentlicher Erstellername gespeichert. Der Befehl /palette speichert das ausgewählte Bild einschließlich Metadaten unter einem öffentlichen Link. Das Bild oder seine Metadaten können andere Personen betreffen; hierfür ist Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO mit dem berechtigten Interesse, die angeforderte Palette bereitzustellen. Für Discord selbst gelten die Hinweise in Abschnitt 8.",
    basis:
      "Die Speicherung erfolgt auf eigener Infrastruktur des Verantwortlichen in Deutschland. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO; für Moderation, Missbrauchsschutz und Daten Dritter Art. 6 Abs. 1 lit. f DSGVO. Die berechtigten Interessen liegen im sicheren Betrieb und in der Bereitstellung der angeforderten Funktionen.",
    retention:
      "Im Übrigen bleiben Konto- und Inhaltsdaten gespeichert, bis Sie sie löschen oder die Löschung anfordern, höchstens jedoch bis zu 10 Jahre. Löschanfragen richten Sie an ",
  },
  en: {
    title: "User account and content",
    accountHeading: "User account",
    account:
      "For your account, BeastyPage stores your Clerk ID and username, which may be derived from your name or e-mail address, along with settings and an API key for stream tools. Sign-in is provided by Clerk (see section 7).",
    contentHeading: "Content you create",
    content:
      "Stored content includes settings, cats, ancestry trees, Catdex entries, game and voting data, and stream sessions. Public or shared content is visible to others. Uploaded images are stored as uploaded, including their metadata.",
    quickShare:
      "Quick Share processes files, filenames and IP addresses for file sharing and abuse protection. Links expire after 1–30 days. Files and IP addresses are deleted after 30 days.",
    discordHeading: "Discord bot",
    discord:
      "The Discord bot processes your Discord ID and preferences. Your display name is stored as the public creator name. The /palette command stores the selected image, including metadata, under a public link. The image or its metadata may relate to other people; the legal basis for this is Art. 6(1)(f) GDPR, with the legitimate interest of providing the requested palette. Section 8 covers Discord itself.",
    basis:
      "Data is stored on the controller's own infrastructure in Germany. The legal basis is Art. 6(1)(b) GDPR; moderation, abuse protection and third-party data are covered by Art. 6(1)(f) GDPR. The legitimate interests are secure operation and providing the requested features.",
    retention:
      "Otherwise, account and content data is stored until you delete it or request deletion, at most up to 10 years. Send deletion requests to ",
  },
} as const;

export function AccountSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <h3>{copy.accountHeading}</h3>
      <p>{copy.account}</p>
      <h3>{copy.contentHeading}</h3>
      <p>{copy.content}</p>
      <h3>{"Quick Share"}</h3>
      <p>{copy.quickShare}</p>
      <h3>{copy.discordHeading}</h3>
      <p>{copy.discord}</p>
      <p>{copy.basis}</p>
      <p>
        {copy.retention}
        <LegalEmail kind="privacy" />
        {"."}
      </p>
    </PrivacySection>
  );
}
