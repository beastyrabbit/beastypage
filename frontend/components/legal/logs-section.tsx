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
              "Pangolin speichert auf dem Reverse-Proxy ein separates HTTP-Anfrageprotokoll mit denselben Verbindungsdaten für 14 Tage. Das Pangolin-Netzwerkprotokoll enthält Verbindungsmetadaten des Tunnels einschließlich IP-Adressen und wird nach 30 Tagen gelöscht. Diese Protokolle dienen dem sicheren Betrieb und der Fehleranalyse auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO."
            }
          </p>
          <p>
            {
              "Die Dienste von BeastyPage schreiben Betriebs- und Fehlermeldungen. Diese können Anfragepfade, technische Kennungen wie Nutzer-IDs und Fehlerdetails enthalten; IP-Adressen oder Nachrichteninhalte werden nicht gezielt protokolliert. Die Meldungen existieren nur als kurzlebige Kubernetes-Container-Logs und werden bei Logrotation oder Neustart überschrieben. Eine zentrale Logspeicherung gibt es nicht. PostgreSQL protokolliert langsame Datenbankabfragen ab einer Sekunde in denselben kurzlebigen Container-Logs. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt im Betrieb und in der Fehlerbehebung."
            }
          </p>
          <p>
            {
              "Lokale CrowdSec-Meldungen und Sperrentscheidungen (IP-Adresse, Zeitpunkt, Angriffsart) werden auf dem Proxy-Server gespeichert. Lokale Sperren dauern standardmäßig vier Stunden; Meldungen werden normalerweise nach sieben Tagen gelöscht, bei einer noch aktiven Sperre später. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der Abwehr von Angriffen."
            }
          </p>
          <p>
            {
              "Hintergrundaufträge und ihre Ausführungsprotokolle werden in der Datenbank gespeichert. Die Auftragsdaten können auf gespeicherte Datensätze verweisen und Fehlerdetails enthalten. Abgeschlossene und endgültig fehlgeschlagene Aufträge sowie Ausführungsprotokolle werden nach 30 Tagen gelöscht; laufende oder wartende Aufträge unterliegen dieser Frist nicht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in zuverlässiger Verarbeitung und Fehlerbehebung. Für Sicherungskopien gilt Abschnitt 3."
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
              "Pangolin stores a separate HTTP request log on the reverse proxy with the same connection data for 14 days. The Pangolin network log contains tunnel connection metadata, including IP addresses, and is deleted after 30 days. These logs support secure operation and error analysis under Art. 6(1)(f) GDPR."
            }
          </p>
          <p>
            {
              "BeastyPage services write operational and error messages. These may contain request paths, technical identifiers such as user IDs, and error details; IP addresses or message contents are not deliberately logged. These messages exist only as short-lived Kubernetes container logs and are overwritten on log rotation or restart. There is no central log storage. PostgreSQL logs slow database queries taking at least one second in the same short-lived container logs. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is operation and troubleshooting."
            }
          </p>
          <p>
            {
              "Local CrowdSec alerts and blocking decisions (IP address, time, type of attack) are stored on the proxy server. Local blocks last four hours by default; alerts are normally deleted after seven days, or later while a block remains active. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is defending against attacks."
            }
          </p>
          <p>
            {
              "Background jobs and their run logs are stored in the database. Job payloads may reference stored records and contain error details. Completed and permanently failed jobs, and run logs, are deleted after 30 days; running or pending jobs are outside this limit. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is reliable processing and troubleshooting. Section 3 applies to backups."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
