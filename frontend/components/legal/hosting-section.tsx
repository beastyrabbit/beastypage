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
              "Die Datenbank von BeastyPage wird regelmäßig gesichert. Die Sicherungskopien werden innerhalb der eigenen Infrastruktur in Deutschland gespeichert und nach spätestens drei Monaten überschrieben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt im Schutz vor Datenverlust."
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
              "The BeastyPage database is backed up regularly. Backups are stored within the controller's own infrastructure in Germany and overwritten after no more than three months. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is protection against data loss."
            }
          </p>
        </>
      )}
    </PrivacySection>
  );
}
