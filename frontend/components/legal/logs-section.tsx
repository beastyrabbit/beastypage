import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Server-Logfiles",
    introduction:
      "Bei jedem Aufruf speichert der Reverse-Proxy automatisch folgende Daten:",
    fields: [
      "IP-Adresse des anfragenden Geräts",
      "Datum und Uhrzeit des Zugriffs",
      "aufgerufene Adresse (Pfad einschließlich Parameter), HTTP-Methode und Protokoll",
      "HTTP-Statuscode, übertragene Datenmenge und Antwortzeit",
      "Browser-Kennung (User-Agent)",
      "verwendete TLS-Version und Verschlüsselung",
      "angesprochener Dienst",
    ],
    headers:
      "Die Header Cookie und Authorization werden geschwärzt. URL-Pfade und Abfrageparameter werden protokolliert.",
    retention:
      "Die Daten dienen dem Betrieb, der Fehleranalyse und der Abwehr von Angriffen und Missbrauch. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt in Stabilität und Sicherheit des Angebots. Die Logfiles werden nach 14 Tagen automatisch gelöscht.",
    additionalLogs:
      "Der Reverse-Proxy, seine Sicherheitssoftware und die Anwendung führen außerdem technische Protokolle mit Verbindungs-, Sicherheits- und Fehlerdaten, die IP-Adressen und technische Kennungen enthalten können. Sie dienen dem Betrieb, der Fehlerbehebung und der Angriffsabwehr auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO; darin liegt das berechtigte Interesse. Sie werden normalerweise nach höchstens 30 Tagen gelöscht.",
  },
  en: {
    title: "Server log files",
    introduction:
      "For every request, the reverse proxy automatically stores the following data:",
    fields: [
      "IP address of the requesting device",
      "date and time of access",
      "requested address (path including parameters), HTTP method and protocol",
      "HTTP status code, amount of data transferred, and response time",
      "browser identifier (user agent)",
      "TLS version and cipher used",
      "target service",
    ],
    headers:
      "The Cookie and Authorization headers are redacted. URL paths and query parameters are logged.",
    retention:
      "This data is used to operate the site, analyse errors, and defend against attacks and abuse. The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is the stability and security of the service. Log files are deleted automatically after 14 days.",
    additionalLogs:
      "The reverse proxy, its security software and the application also keep technical logs containing connection, security and error data, which may include IP addresses and technical identifiers. They support operation, troubleshooting and attack defence under Art. 6(1)(f) GDPR; this is the legitimate interest. They are normally deleted after no more than 30 days.",
  },
} as const;

export function LogsSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.introduction}</p>
      <ul>
        {copy.fields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
      <p>{copy.headers}</p>
      <p>{copy.retention}</p>
      <p>{copy.additionalLogs}</p>
    </PrivacySection>
  );
}
