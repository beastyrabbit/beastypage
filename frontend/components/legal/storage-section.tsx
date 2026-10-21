import { CONSENT_RETENTION_DAYS } from "@/lib/telemetry/storage-inventory";
import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const storageRows = {
  de: [
    [
      "__client_uat… (Cookies), __clerk_environment (Browser-Speicher)",
      "Clerk",
      "Anmeldung und Kontozugang",
      "Bis zu etwa 400 Tage",
      "Technisch notwendig, § 25 Abs. 2 Nr. 2 TDDDG",
    ],
    [
      "cc_cookie (Cookie)",
      "BeastyPage",
      "Speichert Ihre Einwilligungsentscheidung",
      `${CONSENT_RETENTION_DAYS} Tage`,
      "Technisch notwendig, § 25 Abs. 2 Nr. 2 TDDDG",
    ],
    [
      "localStorage und sessionStorage",
      "BeastyPage",
      "Gespeicherte Einstellungen, Bearbeitungsrechte, Upload-Belege und zufällige Kennungen für Limits; nur bei Nutzung der Funktion",
      "Bis Sie die Browserdaten löschen",
      "Technisch notwendig, § 25 Abs. 2 Nr. 2 TDDDG",
    ],
  ],
  en: [
    [
      "__client_uat… (cookies), __clerk_environment (browser storage)",
      "Clerk",
      "Sign-in and account access",
      "Up to about 400 days",
      "Technically necessary, Section 25(2) no. 2 TDDDG",
    ],
    [
      "cc_cookie (cookie)",
      "BeastyPage",
      "Stores your consent choice",
      `${CONSENT_RETENTION_DAYS} days`,
      "Technically necessary, Section 25(2) no. 2 TDDDG",
    ],
    [
      "localStorage and sessionStorage",
      "BeastyPage",
      "Saved settings, edit rights, upload receipts and random IDs for limits; only when you use the feature",
      "Until you delete browser data",
      "Technically necessary, Section 25(2) no. 2 TDDDG",
    ],
  ],
} as const;

export function StorageSection({ lang, number }: PrivacySectionProps) {
  const de = lang === "de";
  const headings = de
    ? ["Name / Speicher", "Anbieter", "Zweck", "Dauer", "Kategorie"]
    : ["Name / storage", "Provider", "Purpose", "Duration", "Category"];
  return (
    <PrivacySection
      number={number}
      title={
        de ? "Cookies und lokale Speicherung" : "Cookies and local storage"
      }
    >
      <p>
        {de
          ? "Die folgende Tabelle fasst Cookies und Browser-Speicher nach ihrem Zweck zusammen."
          : "The following table groups cookies and browser storage by purpose."}
      </p>
      <section
        aria-label={
          de ? "Cookies und Browser-Speicher" : "Cookies and browser storage"
        }
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus this region to scroll the wide table.
        tabIndex={0} // NOSONAR: focusable scroll region for keyboard users (WCAG 2.1.1)
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
              {headings.map((heading) => (
                <th key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {storageRows[lang].map(
              ([name, provider, purpose, duration, category]) => (
                <tr key={`${provider}-${name}`}>
                  <td className="max-w-xs break-words">{name}</td>
                  <td>{provider}</td>
                  <td>{purpose}</td>
                  <td>{duration}</td>
                  <td>{category}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>
      <p>
        {de
          ? "Sie können Ihre Analyse-Einwilligung jederzeit über „Cookie settings“ im Footer ändern oder widerrufen (siehe Abschnitt 9)."
          : 'You can change or withdraw your analytics consent at any time through "Cookie settings" in the footer (see section 9).'}
      </p>
    </PrivacySection>
  );
}
