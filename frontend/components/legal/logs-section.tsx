import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function LogsSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={lang === "de" ? "Server-Logfiles" : "Server log files"}
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Bei jedem Aufruf speichert der Reverse-Proxy automatisch folgende Daten:"
            }
          </p>
          <ul>
            <li>{"IP-Adresse des anfragenden Geräts"}</li>
            <li>{"Datum und Uhrzeit des Zugriffs"}</li>
            <li>
              {
                "aufgerufene Adresse (Pfad einschließlich Parameter), HTTP-Methode und Protokoll"
              }
            </li>
            <li>{"HTTP-Statuscode, übertragene Datenmenge und Antwortzeit"}</li>
            <li>{"Browser-Kennung (User-Agent)"}</li>
            <li>{"verwendete TLS-Version und Verschlüsselung"}</li>
            <li>{"angesprochener Dienst"}</li>
          </ul>
          <p>
            {
              "Die Header Cookie und Authorization werden geschwärzt. URL-Pfade und Abfrageparameter werden protokolliert."
            }
          </p>
          <p>
            {
              "Die Daten dienen dem Betrieb, der Fehleranalyse und der Abwehr von Angriffen und Missbrauch. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt in Stabilität und Sicherheit des Angebots. Die Logfiles werden nach 14 Tagen automatisch gelöscht."
            }
          </p>
          <p>
            {
              "Der Reverse-Proxy, seine Sicherheitssoftware und die Anwendung führen außerdem technische Protokolle mit Verbindungs-, Sicherheits- und Fehlerdaten, die IP-Adressen und technische Kennungen enthalten können. Sie dienen dem Betrieb, der Fehlerbehebung und der Angriffsabwehr auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO; darin liegt das berechtigte Interesse. Sie werden normalerweise nach höchstens 30 Tagen gelöscht."
            }
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "For every request, the reverse proxy automatically stores the following data:"
            }
          </p>
          <ul>
            <li>{"IP address of the requesting device"}</li>
            <li>{"date and time of access"}</li>
            <li>
              {
                "requested address (path including parameters), HTTP method and protocol"
              }
            </li>
            <li>
              {
                "HTTP status code, amount of data transferred, and response time"
              }
            </li>
            <li>{"browser identifier (user agent)"}</li>
            <li>{"TLS version and cipher used"}</li>
            <li>{"target service"}</li>
          </ul>
          <p>
            {
              "The Cookie and Authorization headers are redacted. URL paths and query parameters are logged."
            }
          </p>
          <p>
            {
              "This data is used to operate the site, analyse errors, and defend against attacks and abuse. The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is the stability and security of the service. Log files are deleted automatically after 14 days."
            }
          </p>
          <p>
            {
              "The reverse proxy, its security software and the application also keep technical logs containing connection, security and error data, which may include IP addresses and technical identifiers. They support operation, troubleshooting and attack defence under Art. 6(1)(f) GDPR; this is the legitimate interest. They are normally deleted after no more than 30 days."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
