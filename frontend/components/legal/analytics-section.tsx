import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export const TELEMETRY_RETENTION = {
  de: "Umami-Analysedaten (Seitenaufrufe und Ereignisse) werden nach 25 Monaten gelöscht. Umami-Sitzungsaufzeichnungen und Heatmap-Aufzeichnungen werden nach 30 Tagen gelöscht. GlitchTip-Fehlerereignisse werden nach 90 Tagen gelöscht.",
  en: "Umami analytics data (pageviews and events) is deleted after 25 months. Umami session replays and heatmap recordings are deleted after 30 days. GlitchTip error events are deleted after 90 days.",
} as const;

const localizedCopy = {
  de: {
    title: "Umami (Nutzungsanalyse) und GlitchTip (Fehlererfassung)",
    hosting:
      "Umami (umami.heerlab.com) und GlitchTip (glitchtip.heerlab.com) werden vom Verantwortlichen im eigenen Homelab in Deutschland betrieben. Für diese Dienste wird kein externer Auftragsverarbeiter eingesetzt.",
    analytics:
      "Umami wird nur nach Ihrer Einwilligung in die Kategorie „analytics“ geladen. Erfasst werden Seitenaufrufe einschließlich Navigation innerhalb der Website, der bereinigte Referrer, Browser, Betriebssystem, Gerätetyp, Bildschirmgröße, Sprache sowie aus der IP-Adresse abgeleitete Angaben zu Land, Region und Stadt. Umami speichert die IP-Adresse nicht, sondern bildet eine pseudonyme Sitzungskennung aus einem Hash mit Website-Kennung, IP-Adresse, Browserkennung und wechselndem Salt. Wir übermitteln keine Benutzerkennung. Query-Strings und URL-Fragmente werden entfernt; Pfade mit Zugangs- oder Bearbeitungsrechten werden bereinigt.",
    events:
      "Außerdem erfassen wir Ereignisse zur Nutzung der Werkzeuge: Anmeldung und Abmeldung ohne Identität, Katzengenerierung und Baukasten, Adoption, Glücksrad, Catdex-Suche und Uploads, Münzwurf, Katzenvergleiche, Palettenwerkzeuge, Pixelator, Stammbäume, Stream-Teilnahme, Verlauf sowie Navigation, Teilen und Exportieren. Dazu gehören die gewählten Optionen, Zähler und Erfolg oder Fehlschlag, Klicks auf externe Links mit deren Hostnamen sowie Web Vitals zur Lade- und Reaktionsgeschwindigkeit. Freie Fehlermeldungen werden aus diesen Nutzungsereignissen entfernt.",
    replay:
      "Sitzungsaufzeichnungen und Heatmaps werden nach Einwilligung mit einer Stichprobe von jeweils höchstens 15 % erstellt. Sämtliche Texte und Eingaben werden strikt maskiert. Clerk-Anmeldeoberflächen und als privat markierte Bereiche werden blockiert; bei angemeldeten Personen wird der gesamte Seiteninhalt für die Aufzeichnung blockiert. Auf OBS-Overlay-Routen sind Umami, Sitzungsaufzeichnungen und Heatmaps nicht aktiv. Tracker und Recorder setzen keine Cookies und schreiben weder in localStorage noch in sessionStorage. Ein manuell gesetzter Opt-out-Eintrag „umami.disabled“ wird nur gelesen.",
    consent:
      "Rechtsgrundlagen sind Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG. Sie können Ihre Einwilligung jederzeit über „Cookie settings“ im Footer mit Wirkung für die Zukunft widerrufen. Beim Widerruf wird die Seite neu geladen, um die Aufzeichnung zu beenden. Cookies und Browser-Speicher sind in Abschnitt 15 beschrieben.",
    errors:
      "GlitchTip erfasst technische Fehler auch ohne Einwilligung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist der funktionsfähige und sichere Betrieb der Website. Die Fehlererfassung verwendet keine Cookies und keinen Browser-Speicher. Berichte enthalten Fehler und Stacktrace, Browser und Betriebssystem, die bereinigte URL, die Anwendungsversion und bereinigte Breadcrumbs zum technischen Ablauf. Die automatische Erfassung von Benutzerinformationen durch die SDKs ist deaktiviert. Benutzerkennungen, E-Mail-Adressen, Cookies, Request-Bodies und Query-Strings werden nicht übermittelt bzw. vor dem Versand entfernt oder maskiert. Performance-Tracing wird im Browser mit 10 % und auf dem Server mit 5 % abgetastet. Auch die Backend-Dienste Renderer, Bildverarbeitung, Media und Discord-Bot melden Fehler.",
    errorRetention:
      "Sie können der Verarbeitung nach Art. 21 DSGVO über die in Abschnitt 1 genannten Kontaktdaten des Verantwortlichen widersprechen.",
    errorIp:
      "Bei direkten Fehlermeldungen aus Ihrem Browser wird Ihre IP-Adresse technisch übertragen und von GlitchTip nur in anonymisierter Form mit dem Fehlerbericht gespeichert. Dazu werden bei IPv4 die letzten 8 Bit und bei IPv6 die letzten 64 Bit auf null gesetzt.",
  },
  en: {
    title: "Umami (analytics) and GlitchTip (error tracking)",
    hosting:
      "The controller self-hosts Umami (umami.heerlab.com) and GlitchTip (glitchtip.heerlab.com) in their own homelab in Germany. No external processor is used for these services.",
    analytics:
      'Umami loads only after you consent to the "analytics" category. It collects pageviews, including navigation within the website, the scrubbed referrer, browser, operating system, device type, screen size, language and country, region and city derived from the IP address. Umami does not store the IP address. It derives a pseudonymous session ID from a hash using the website ID, IP address, browser identifier and rotating salt. We send no user identifier. Query strings and URL fragments are removed, and paths granting access or editing rights are scrubbed.',
    events:
      "We also collect events about tool use: sign-in and sign-out without identity, cat generation and builders, adoption, wheel spins, Catdex searches and uploads, coinflips, cat comparisons, palette tools, Pixelator, ancestry trees, stream participation, history, navigation, sharing and exporting. These include selected options, counts and success or failure, outbound link clicks with their hostnames, and Web Vitals measuring loading and responsiveness. Free-text error messages are removed from these usage events.",
    replay:
      'After consent, session replay and heatmaps each use a sample of at most 15%. All text and inputs are strictly masked. Clerk sign-in interfaces and areas marked as private are blocked; for signed-in visitors, the entire page content is blocked from recording. Umami, replay and heatmaps are inactive on OBS overlay routes. The tracker and recorder set no cookies and write neither localStorage nor sessionStorage. A manually set "umami.disabled" opt-out entry is only read.',
    consent:
      'The legal bases are Art. 6(1)(a) GDPR and Section 25(1) TDDDG. You can withdraw consent at any time through "Cookie settings" in the footer, with effect for the future. Withdrawal reloads the page to stop recording. Section 15 describes cookies and browser storage.',
    errors:
      "GlitchTip collects technical errors without consent. The legal basis is Art. 6(1)(f) GDPR; our legitimate interest is keeping the website working and secure. Error tracking uses no cookies or browser storage. Reports contain the error and stack trace, browser and operating system, the scrubbed URL, application release and scrubbed breadcrumbs describing the technical sequence. Automatic collection of user information by the SDKs is disabled. User IDs, email addresses, cookies, request bodies and query strings are not sent or are removed or masked before sending. Performance tracing samples 10% in the browser and 5% on the server. The renderer, image-processing, media and Discord-bot backend services also report errors.",
    errorRetention:
      "You can object to this processing under Art. 21 GDPR through the controller contact details in section 1.",
    errorIp:
      "When your browser sends an error report directly, your IP address is technically transmitted and stored by GlitchTip with the report only in anonymized form. The last 8 bits of IPv4 addresses and the last 64 bits of IPv6 addresses are set to zero.",
  },
} as const;

export function AnalyticsSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.hosting}</p>
      <p>{copy.analytics}</p>
      <p>{copy.events}</p>
      <p>{copy.replay}</p>
      <p>{copy.consent}</p>
      <p>{TELEMETRY_RETENTION[lang]}</p>
      <p>{copy.errors}</p>
      <p>{copy.errorIp}</p>
      <p>{copy.errorRetention}</p>
    </PrivacySection>
  );
}
