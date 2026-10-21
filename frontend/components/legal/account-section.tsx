import { LegalEmail } from "./operator-contact";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function AccountSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de" ? "Nutzerkonto und Inhalte" : "User account and content"
      }
    >
      {lang === "de" ? (
        <>
          <h3>{"Nutzerkonto"}</h3>
          <p>
            {
              "Die Anmeldung erfolgt über Clerk (siehe Abschnitt 7). BeastyPage selbst speichert je Konto die interne Nutzer-ID, die Clerk-Nutzer-ID, den Benutzernamen, die Profilbild-Präferenz, einen API-Schlüssel für Stream-/OBS-Werkzeuge und Zeitstempel. Ist kein Benutzername gesetzt, kann dieser aus dem Namen oder dem Teil der E-Mail-Adresse vor dem @ abgeleitet werden. Andere angemeldete Nutzer können Benutzernamen über die Nutzersuche finden. BeastyPage selbst speichert weder Passwort noch E-Mail-Adresse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO."
            }
          </p>
          <h3>{"Erstellte und gespeicherte Inhalte"}</h3>
          <p>
            {
              "Gespeichert werden Werkzeugeinstellungen und Varianten, Katzen, Adoptionsgruppen und geteilte Ansichten, auf Wunsch passwortgeschützte Stammbäume, Catdex-Einreichungen einschließlich Twitch-Benutzername zur Zuordnung, Spielstände und Stimmen mit dem eingegebenen Namen, Stream-Sitzungen mit Anzeigenamen der Zuschauer und Stimmen, Drehrad-Drehungen sowie OBS-Overlay-Einstellungen. Öffentliche oder geteilte Inhalte sind für Personen mit dem Link oder öffentlich im Katalog sichtbar."
            }
          </p>
          <p>
            {
              "Beim Discord-Bot werden Ihre Discord-Nutzer-ID und Bot-Einstellungen verarbeitet. Über den Bot erzeugte Katzen werden mit Ihrem Discord-Anzeigenamen als öffentlichem Erstellernamen gespeichert. Der Befehl /palette, auch über das Nachrichten-Kontextmenü, lädt das ausgewählte Bild von der angegebenen URL oder aus einem Anhang oder eingebetteten Bild der gewählten Nachricht herunter. Das Bild kann andere Personen zeigen. Es wird zusammen mit der extrahierten Farbpalette auf eigener Infrastruktur des Verantwortlichen in Deutschland unter einem öffentlichen Link ohne automatische Ablaufzeit gespeichert. Die Löschung können Sie unter "
            }
            <LegalEmail kind="privacy" />
            {
              " anfordern. Rechtsgrundlage ist wie für die anderen Bot-Inhalte Art. 6 Abs. 1 lit. b DSGVO. Soweit das Bild andere Personen zeigt, ist Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der Bereitstellung der angeforderten Palette. Discord betreibt seine Plattform eigenverantwortlich; Anbieter und Datenschutzhinweise stehen in Abschnitt 8."
            }
          </p>
          <p>
            {
              "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO; für Moderation Art. 6 Abs. 1 lit. f DSGVO mit dem berechtigten Interesse, Missbrauch zu verhindern. Die Speicherung erfolgt in PostgreSQL auf eigener Infrastruktur in Deutschland. Konto- und Inhaltsdaten bleiben gespeichert, bis Sie sie löschen, soweit die Oberfläche dies anbietet (z. B. Varianten, Stammbäume oder "
            }
            <code>{"/config reset"}</code>
            {
              " beim Bot), oder die Löschung anfordern. Eine allgemeine automatische Ablaufzeit gibt es nicht. Die Löschung des Clerk-Kontos löscht die bei BeastyPage gespeicherten Daten nicht automatisch. Schreiben Sie dafür an "
            }
            <LegalEmail kind="privacy" />
            {"."}
          </p>
          <p>
            {
              "Hochgeladene sowie über den Discord-Befehl /palette gespeicherte Bilder werden unverändert einschließlich eingebetteter Metadaten wie EXIF gespeichert. Öffentlich ausgelieferte Bilder können von Browsern bis zu einem Jahr zwischengespeichert werden. Nicht mehr referenzierte Bilddateien können nach 24 Stunden bei der täglichen Bereinigung gelöscht werden."
            }
          </p>
          <h3>{"Quick Share"}</h3>
          <p>
            {
              "Quick Share verarbeitet hochgeladene Dateien mit ursprünglichem Dateinamen, Typ und Größe, gegebenenfalls Ihr Konto sowie Ihre IP-Adresse im Klartext und als schlüsselbasierten Hash für Missbrauchsschutz und Kontingente. Öffentliche Links gelten ohne Anmeldung bei bis zu 25 MiB sieben Tage und bei größeren Dateien einen Tag; mit Anmeldung bei bis zu 250 MiB 30 Tage und bei größeren Dateien sieben Tage. Bei berechtigten Dateien ist eine einmalige Verlängerung bis zum 30. Tag nach Erstellung möglich."
            }
          </p>
          <p>
            {
              "Originaldateien und Metadaten einschließlich IP-Adresse werden nach 30 Tagen zur Löschung vorgesehen; die stündliche Wartung stößt die Löschung an. Die Metadaten werden entfernt, sobald die Objektlöschung abgeschlossen ist. Bildvorschauen werden ohne Metadaten neu kodiert, Originale behalten ihre Metadaten. Eine Entfernung von Videometadaten ist nicht gewährleistet. Upload-Zähler laufen nach spätestens zwei Tagen ab. Missbrauchssperren speichern IP-Hash, Grund und moderierende Person; die Klartext-IP wird nach 30 Tagen entfernt und bei Aufhebung einer Sperre sofort gelöscht. Das Aufheben markiert den Sperreintrag als inaktiv; für den verbleibenden Eintrag gibt es keine automatische Löschfrist."
            }
          </p>
          <p>
            {
              "Dateien liegen im eigenen Objektspeicher des Verantwortlichen in Deutschland. Nutzer können Freigaben nicht selbst löschen; schreiben Sie an "
            }
            <LegalEmail kind="privacy" />
            {
              ". Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für die Dateifreigabe und Art. 6 Abs. 1 lit. f DSGVO für Missbrauchsprävention."
            }
          </p>
          <h3>{"Kurzlebige Datensätze"}</h3>
          <p>
            {
              "Upload-Zwischenspeicherung läuft nach einer Stunde ab, Discord-Challenges nach fünf Minuten, Spielpaarungen nach 15 Minuten und Live-Update-Ereignisse nach einer Stunde. Abgelaufene Datensätze werden durch Hintergrundaufträge bereinigt."
            }
          </p>
          <h3>{"Sicherungskopien"}</h3>
          <p>{"Für Sicherungskopien gilt Abschnitt 3."}</p>
        </>
      ) : (
        <>
          <h3>{"User account"}</h3>
          <p>
            {
              "Sign-in is provided by Clerk (see section 7). For each account, BeastyPage itself stores the internal user ID, Clerk user ID, username, profile-picture preference, an API key for stream/OBS tools and timestamps. If no username is set, it may be derived from your name or the part of your e-mail address before the @. Other signed-in users can find usernames through user search. BeastyPage itself stores neither passwords nor e-mail addresses. The legal basis is Art. 6(1)(b) GDPR."
            }
          </p>
          <h3>{"Content you create or save"}</h3>
          <p>
            {
              "Stored content includes tool settings and variants, cats, adoption batches and shared views, optionally password-protected ancestry trees, Catdex submissions including a Twitch username for attribution, game scores and votes with the name you enter, stream sessions with viewer display names and votes, wheel spins, and OBS overlay settings. Public or shared content is visible to people with the link or publicly in the catalogue."
            }
          </p>
          <p>
            {
              "The Discord bot processes your Discord user ID and bot preferences. Cats generated through the bot are saved with your Discord display name as the public creator name. The /palette command, including the message context menu, downloads the selected image from the supplied URL or an attachment or embedded image in the selected message. The image may show other people. It is stored together with the extracted palette on the controller's own infrastructure in Germany under a public link with no automatic expiry. You can request deletion at "
            }
            <LegalEmail kind="privacy" />
            {
              ". As with other bot content, the legal basis is Art. 6(1)(b) GDPR. Where the image shows other people, the legal basis is Art. 6(1)(f) GDPR, with the legitimate interest of providing the requested palette. Discord operates its platform under its own responsibility; provider details and privacy information are in section 8."
            }
          </p>
          <p>
            {
              "The legal basis is Art. 6(1)(b) GDPR; moderation is based on Art. 6(1)(f) GDPR with the legitimate interest of preventing abuse. Data is stored in PostgreSQL on the controller's own infrastructure in Germany. Account and content data remains until you delete it, where the interface offers deletion (e.g. variants, ancestry trees or "
            }
            <code>{"/config reset"}</code>
            {
              " in the bot), or request deletion. There is no general automatic expiry. Deleting your Clerk account does not automatically delete data stored by BeastyPage. To request this, write to "
            }
            <LegalEmail kind="privacy" />
            {"."}
          </p>
          <p>
            {
              "Uploaded images and images stored through the Discord /palette command are stored unchanged, including embedded metadata such as EXIF. Publicly served images may be cached by browsers for up to one year. Unreferenced image files may be deleted after 24 hours during daily cleanup."
            }
          </p>
          <h3>{"Quick Share"}</h3>
          <p>
            {
              "Quick Share processes uploaded files with their original filename, type and size, your account if applicable, and your IP address in plain text and as a keyed hash for abuse protection and quotas. Public links last seven days for anonymous files up to 25 MiB and one day for larger files; signed-in files up to 250 MiB last 30 days and larger files seven days. Eligible files can receive a one-time extension up to day 30 from creation."
            }
          </p>
          <p>
            {
              "Originals and metadata, including the IP address, are scheduled for deletion after 30 days; hourly maintenance starts deletion. Metadata is removed once object deletion completes. Image previews are re-encoded without metadata; originals retain theirs. Removal of video metadata is not guaranteed. Upload counters expire after no more than two days. Abuse bans store an IP hash, reason and moderator; the plain IP is removed after 30 days and immediately when a ban is lifted. Lifting a ban marks the record inactive; there is no automatic deletion deadline for the remaining record."
            }
          </p>
          <p>
            {
              "Files are stored in the controller's own object storage in Germany. Users cannot delete shares themselves; write to "
            }
            <LegalEmail kind="privacy" />
            {
              ". The legal basis is Art. 6(1)(b) GDPR for sharing and Art. 6(1)(f) GDPR for abuse prevention."
            }
          </p>
          <h3>{"Short-lived records"}</h3>
          <p>
            {
              "Upload staging expires after one hour, Discord challenges after five minutes, game matchups after 15 minutes and live-update events after one hour. Background jobs clean up expired records."
            }
          </p>
          <h3>{"Backups"}</h3>
          <p>{"Section 3 applies to backups."}</p>
        </>
      )}
    </PrivacySection>
  );
}
