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
      "Umami wird nur nach Ihrer Einwilligung geladen. Erfasst werden Seitenaufrufe und Nutzungsereignisse (welche Werkzeuge und Funktionen genutzt werden, Klicks auf externe Links und Ladegeschwindigkeit), technische Geräte- und Browserinformationen sowie ein ungefährer, aus der IP-Adresse abgeleiteter Standort. Die IP-Adresse wird nicht gespeichert; stattdessen wird eine pseudonyme Sitzungskennung verwendet. Wir übermitteln keine Benutzerkennung. URL-Parameter und URL-Fragmente werden entfernt; Pfade mit Zugangs- oder Bearbeitungsrechten werden bereinigt.",
    replay:
      "Sitzungsaufzeichnungen und Heatmaps werden nur für eine Stichprobe der Besuche erstellt. Alle Texte und Eingaben werden maskiert. Anmeldebereiche und Seiten angemeldeter Besucher sind von der Aufzeichnung ausgeschlossen. Auf OBS-Overlay-Seiten sind Umami, Sitzungsaufzeichnungen und Heatmaps nicht aktiv. Umami setzt keine Cookies.",
    consent:
      "Rechtsgrundlagen sind Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG. Sie können Ihre Einwilligung jederzeit über „Cookie settings“ im Footer mit Wirkung für die Zukunft widerrufen. Beim Widerruf wird die Seite neu geladen, um die Aufzeichnung zu beenden. Cookies und Browser-Speicher sind in Abschnitt 15 beschrieben.",
    errors:
      "GlitchTip erfasst technische Fehler auch ohne Einwilligung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist der funktionsfähige und sichere Betrieb der Website. Die Fehlererfassung verwendet keine Cookies und keinen Browser-Speicher. Fehlerberichte enthalten technische Angaben: den Fehler und die Stelle, an der er auftrat, Browser und Betriebssystem, die bereinigte Seitenadresse und die Anwendungsversion. Personenbezogene Daten wie Benutzerkennungen, E-Mail-Adressen, Cookies und Formularinhalte werden vor dem Versand entfernt. Dies gilt für die Website und ihre Backend-Dienste.",
    errorRetention:
      "Sie können der Verarbeitung nach Art. 21 DSGVO über die in Abschnitt 1 genannten Kontaktdaten des Verantwortlichen widersprechen.",
    errorIp:
      "Die IP-Adresse wird aus technischen Gründen übertragen und von GlitchTip nur in gekürzter, anonymisierter Form gespeichert.",
  },
  en: {
    title: "Umami (analytics) and GlitchTip (error tracking)",
    hosting:
      "The controller self-hosts Umami (umami.heerlab.com) and GlitchTip (glitchtip.heerlab.com) in their own homelab in Germany. No external processor is used for these services.",
    analytics:
      "Umami loads only after your consent. It records page views and usage events (which tools and functions are used, clicks on external links and loading speed), technical device and browser information, and an approximate location derived from the IP address. The IP address is not stored; a pseudonymous session identifier is used instead. We send no user identifier. URL parameters and fragments are removed, and paths granting access or editing rights are cleaned.",
    replay:
      "Session replay and heatmaps are recorded for a sample of visits only. All text and inputs are masked, and sign-in areas and pages of signed-in visitors are excluded from recording. Umami, replay and heatmaps are inactive on OBS overlay pages. Umami sets no cookies.",
    consent:
      'The legal bases are Art. 6(1)(a) GDPR and Section 25(1) TDDDG. You can withdraw consent at any time through "Cookie settings" in the footer, with effect for the future. Withdrawal reloads the page to stop recording. Section 15 describes cookies and browser storage.',
    errors:
      "GlitchTip collects technical errors without consent. The legal basis is Art. 6(1)(f) GDPR; our legitimate interest is keeping the website working and secure. Error tracking uses no cookies or browser storage. Error reports contain technical details: the error and where it occurred, browser and operating system, the cleaned page address, and the app version. Personal data such as user IDs, email addresses, cookies and form contents are removed before sending. This covers the website and its backend services.",
    errorRetention:
      "You can object to this processing under Art. 21 GDPR through the controller contact details in section 1.",
    errorIp:
      "The IP address is transmitted for technical reasons, and GlitchTip stores it only in shortened, anonymised form.",
  },
} as const;

export function AnalyticsSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.hosting}</p>
      <p>{copy.analytics}</p>
      <p>{copy.replay}</p>
      <p>{copy.consent}</p>
      <p>{TELEMETRY_RETENTION[lang]}</p>
      <p>{copy.errors}</p>
      <p>{copy.errorIp}</p>
      <p>{copy.errorRetention}</p>
    </PrivacySection>
  );
}
