import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const appStorage = [
  [
    "catdex-upload:client-key",
    "localStorage",
    "Zufällige Kennung für Upload-Limits",
    "Random ID for upload limits",
  ],
  [
    "classic-wheel:client-key",
    "localStorage",
    "Zufällige Kennung für Limits und Verlauf",
    "Random ID for limits and history",
  ],
  [
    "stream-viewer-session:fingerprint",
    "localStorage",
    "Zufällige Kennung, kein Geräte-Fingerprint",
    "Random ID, not a device fingerprint",
  ],
  [
    "stream-viewer-session / stream-viewer-session:<viewerKey>",
    "sessionStorage (localStorage fallback)",
    "Zuschauer-Sitzung",
    "Viewer session",
  ],
  [
    "beastyrabbit.quick-share.receipts.v1",
    "localStorage",
    "Ihre letzten zehn Uploads und Zugriffsbelege",
    "Your last ten uploads and access receipts",
  ],
  [
    "ancestry-tree-edit:<slug>",
    "localStorage / sessionStorage",
    "Bearbeitungsrechte für Ihren Stammbaum",
    "Edit rights for your ancestry tree",
  ],
  [
    "beastypage:mapper-edit-token:<slug>",
    "localStorage",
    "Bearbeitungsrechte für Ihre Inhalte",
    "Edit rights for your content",
  ],
  [
    "singleCatPlus.variants",
    "localStorage",
    "Gespeicherte Einstellungen und Varianten",
    "Saved settings and variants",
  ],
  [
    "pixelator-variants",
    "localStorage",
    "Gespeicherte Einstellungen und Varianten",
    "Saved settings and variants",
  ],
  [
    "paletteGenerator.collection",
    "localStorage",
    "Gespeicherte Farbpaletten",
    "Saved colour palettes",
  ],
] as const;

export function StorageSection({ lang, number }: PrivacySectionProps) {
  const de = lang === "de";
  const necessary = de
    ? "Technisch notwendig, § 25 Abs. 2 Nr. 2 TDDDG"
    : "Technically necessary, Section 25(2) no. 2 TDDDG";
  const localDuration = de
    ? "Bis Sie die Browserdaten löschen"
    : "Until you delete browser data";
  const bothDuration = de
    ? "localStorage: bis Sie die Browserdaten löschen; sessionStorage: bis zum Schließen des Tabs"
    : "localStorage: until you delete browser data; sessionStorage: until the tab is closed";
  const fallbackDuration = de
    ? "sessionStorage: bis zum Schließen des Tabs; localStorage (Fallback): bis Sie die Browserdaten löschen"
    : "sessionStorage: until the tab is closed; localStorage (fallback): until you delete browser data";
  const durations = {
    localStorage: localDuration,
    "sessionStorage (localStorage fallback)": fallbackDuration,
    "localStorage / sessionStorage": bothDuration,
  };
  const posthogPrefix = de ? "ph_<projekt>" : "ph_<project>";
  const rows = [
    [
      "__client_uat, __client_uat_<suffix> (Cookies)",
      "Clerk (.beastyrabbit.com)",
      de ? "Anmeldestatus" : "Sign-in state",
      de ? "Etwa 400 Tage" : "About 400 days",
      necessary,
    ],
    [
      "__clerk_environment (localStorage)",
      "Clerk",
      de
        ? "Cache der öffentlichen Konfiguration"
        : "Public configuration cache",
      de ? "Etwa 24 Stunden" : "About 24 hours",
      necessary,
    ],
    [
      `${posthogPrefix}_posthog (localStorage / sessionStorage); ${posthogPrefix}_window_id, ${posthogPrefix}_primary_window_exists, ${posthogPrefix}_session_registered_properties (sessionStorage)`,
      "PostHog",
      de
        ? "Analyse-, Geräte-, Fenster- und Sitzungskennungen"
        : "Analytics, device, window and session identifiers",
      de
        ? `localStorage (${posthogPrefix}_posthog): bis Sie die Browserdaten löschen; sessionStorage: bis zum Schließen des Tabs`
        : `localStorage (${posthogPrefix}_posthog): until you delete browser data; sessionStorage: until the tab is closed`,
      de
        ? "Einwilligungsbedürftig nach § 25 Abs. 1 TDDDG; derzeit ohne Einwilligung gesetzt (siehe Abschnitt 9)"
        : "Requires consent under Section 25(1) TDDDG; currently set without consent (see section 9)",
    ],
    ...appStorage.map(([name, storage, purposeDe, purposeEn]) => [
      `${name} (${storage})`,
      "BeastyPage",
      de ? purposeDe : purposeEn,
      durations[storage],
      necessary,
    ]),
  ];
  return (
    <PrivacySection
      number={number}
      title={
        de ? "Cookies und lokale Speicherung" : "Cookies and local storage"
      }
    >
      <p>
        {de
          ? "Die folgende Tabelle beschreibt Cookies und Browser-Speicher. Eigene Speichereinträge von BeastyPage entstehen nur bei Nutzung der jeweiligen Funktion und sind für die angeforderte Funktion erforderlich."
          : "The table below describes cookies and browser storage. BeastyPage's own entries are created only when you use the corresponding feature and are necessary for the function you request."}
      </p>
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus this region to scroll the wide table.
        tabIndex={0}
        aria-label={
          de ? "Cookies und Browser-Speicher" : "Cookies and browser storage"
        }
        className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:p-3 [&_td]:align-top [&_th]:p-3">
          <caption className="p-3 text-left font-semibold">
            {de
              ? "Speichereinträge und Speicherdauer"
              : "Storage entries and duration"}
          </caption>
          <thead>
            <tr>
              {(de
                ? ["Name / Speicher", "Anbieter", "Zweck", "Dauer", "Kategorie"]
                : [
                    "Name / storage",
                    "Provider",
                    "Purpose",
                    "Duration",
                    "Category",
                  ]
              ).map((heading) => (
                <th key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, provider, purpose, retention, category]) => (
              <tr key={name}>
                <td className="max-w-xs break-words">{name}</td>
                <td>{provider}</td>
                <td>{purpose}</td>
                <td>{retention}</td>
                <td>{category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p>
        {de
          ? "Nach der Anmeldung setzt Clerk weitere für die Anmeldung erforderliche Sitzungs-Cookies. Einträge im localStorage bleiben grundsätzlich bis zur Löschung der Browserdaten erhalten; Varianten können nach erfolgreichem Import in Ihr Konto aus dem lokalen Speicher entfernt werden."
          : "After sign-in, Clerk sets further session cookies required for authentication. localStorage entries generally remain until browser data is deleted; variants may be removed from local storage after successful import into your account."}
      </p>
      <p>
        {de
          ? "PostHog greift derzeit ohne vorherige Einwilligung auf den Browser-Speicher zu, obwohl diese Analyse-Speicherung nach § 25 Abs. 1 TDDDG einwilligungsbedürftig ist. Eine Einwilligungsabfrage und die Umstellung auf ein selbst betriebenes Analysewerkzeug sind in Vorbereitung (siehe Abschnitt 9)."
          : "PostHog currently accesses browser storage without prior consent, although this analytics storage requires consent under Section 25(1) TDDDG. A consent prompt and migration to a self-hosted analytics tool are being prepared (see section 9)."}
      </p>
    </PrivacySection>
  );
}
