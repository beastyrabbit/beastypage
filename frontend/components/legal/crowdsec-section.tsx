import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function CrowdSecSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de"
          ? "Schutz vor Angriffen (CrowdSec)"
          : "Protection against attacks (CrowdSec)"
      }
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Zum Schutz vor Angriffen wertet die Sicherheitssoftware CrowdSec die Server-Logfiles automatisch aus und sperrt IP-Adressen, von denen erkennbar Angriffe ausgehen (zum Beispiel massenhafte Anmeldeversuche oder das Ausspähen von Schwachstellen). Erkennt CrowdSec einen Angriff, werden die IP-Adresse, der Zeitpunkt und die Art des Angriffs an die CrowdSec SAS, 20 rue Maurice Arnoux, 92120 Montrouge, Frankreich, übermittelt. CrowdSec nutzt diese Meldungen für eine gemeinsame Sperrliste, die Angriffe auf viele Server abwehrt. Bei normalem Surfen werden keine Daten an CrowdSec übermittelt."
            }
          </p>
          <p>
            {
              "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt im Schutz der Website und ihrer Nutzer vor Angriffen."
            }
          </p>
          <p>
            {
              "Für diese Verarbeitung sind der Verantwortliche und CrowdSec nach Angaben von CrowdSec gemeinsam verantwortlich (Art. 26 DSGVO): CrowdSec ist für den Betrieb seiner zentralen Dienste und Sperrlisten verantwortlich, der Verantwortliche für den Einsatz auf diesem Server. Sie können Ihre Rechte gegenüber beiden geltend machen, bei CrowdSec unter "
            }
            <a href="mailto:dpo@crowdsec.net">{"dpo@crowdsec.net"}</a>
            {
              ". CrowdSec kann die gemeldeten Daten an Mitglieder und Partner seines Netzwerks weitergeben. Übermittlungen in Länder außerhalb der EU erfolgen nach Angaben von CrowdSec auf Grundlage von Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO)."
            }
          </p>
          <p>
            {
              "Vollständige IP-Adressen werden grundsätzlich höchstens drei Monate gespeichert und anschließend schrittweise verallgemeinert. Für bestimmte Angriffsanalysen und Trainingszwecke nennt CrowdSec Ausnahmen von bis zu einem Jahr vor der Anonymisierung. Details: "
            }
            <a href="https://www.crowdsec.net/privacy-policy">
              {"crowdsec.net/privacy-policy"}
            </a>
            {"."}
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "To protect against attacks, the security software CrowdSec automatically analyses the server log files and blocks IP addresses that are clearly the source of attacks (for example mass login attempts or scanning for vulnerabilities). When CrowdSec detects an attack, the IP address, time and type of attack are sent to CrowdSec SAS, 20 rue Maurice Arnoux, 92120 Montrouge, France. CrowdSec uses these reports for a shared blocklist that protects many servers. No data is sent to CrowdSec during normal browsing."
            }
          </p>
          <p>
            {
              "The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is protecting the website and its users from attacks."
            }
          </p>
          <p>
            {
              "According to CrowdSec, the controller and CrowdSec are jointly responsible for this processing (Art. 26 GDPR): CrowdSec is responsible for operating its central services and blocklists, the controller for its use on this server. You can exercise your rights against either of them; CrowdSec can be reached at "
            }
            <a href="mailto:dpo@crowdsec.net">{"dpo@crowdsec.net"}</a>
            {
              ". CrowdSec may pass the reported data on to members and partners of its network. According to CrowdSec, transfers to countries outside the EU are based on the European Commission's Standard Contractual Clauses (Art. 46(2)(c) GDPR)."
            }
          </p>
          <p>
            {
              "Full IP addresses are generally retained for no more than three months and then progressively generalised. CrowdSec describes exceptions of up to one year before anonymisation for certain attack analyses and training purposes. Details: "
            }
            <a href="https://www.crowdsec.net/privacy-policy">
              {"crowdsec.net/privacy-policy"}
            </a>
            {"."}
          </p>
        </>
      )}
    </PrivacySection>
  );
}
