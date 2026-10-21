import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function HostingSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de" ? "Hosting und Bereitstellung" : "Hosting and delivery"
      }
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "BeastyPage läuft auf eigener Server-Infrastruktur des Verantwortlichen in Deutschland. Aufrufe aus dem Internet erreichen die Anwendung über einen Reverse-Proxy auf einem virtuellen Server der netcup GmbH, Emmy-Noether-Straße 10, 76131 Karlsruhe, Deutschland (Rechenzentrum in Nürnberg). netcup verarbeitet die Daten dabei als Auftragsverarbeiter; mit netcup besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO. Die Verbindung ist bis zum Reverse-Proxy TLS-verschlüsselt und wird von dort durch einen verschlüsselten Tunnel an die eigene Infrastruktur weitergeleitet."
            }
          </p>
          <p>
            {
              "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt in einer sicheren und zuverlässigen Bereitstellung der Website."
            }
          </p>
          <p>
            {
              "Zur Datensicherung werden regelmäßig Sicherungskopien innerhalb der eigenen Infrastruktur erstellt; sie werden nach Ablauf ihrer Aufbewahrungszeit überschrieben."
            }
          </p>
        </>
      ) : (
        <>
          <p>
            {
              "BeastyPage runs on the controller's own server infrastructure in Germany. Requests from the internet reach the application through a reverse proxy on a virtual server operated by netcup GmbH, Emmy-Noether-Straße 10, 76131 Karlsruhe, Germany (data center in Nuremberg). netcup processes the data as a processor under a data processing agreement pursuant to Art. 28 GDPR. The connection is TLS-encrypted up to the reverse proxy and forwarded from there to the controller's infrastructure through an encrypted tunnel."
            }
          </p>
          <p>
            {
              "The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is the secure and reliable provision of the website."
            }
          </p>
          <p>
            {
              "For data protection against loss, backup copies are created regularly within the controller's own infrastructure; they are overwritten once their retention period expires."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
