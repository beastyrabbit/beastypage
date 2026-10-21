import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function OAuthSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de"
          ? "Anmeldung mit Discord, GitHub oder Twitch"
          : "Sign-in with Discord, GitHub or Twitch"
      }
    >
      {lang === "de" ? (
        <>
          <p>
            {
              "Nur wenn Sie diese Anmeldeoption wählen, werden Sie zu Discord, GitHub oder Twitch weitergeleitet. Der Anbieter verarbeitet Ihre Anmeldung eigenverantwortlich und übermittelt Ihre Kontoidentität an Clerk. Rechtsgrundlage für die von Ihnen gewählte Anmeldung ist Art. 6 Abs. 1 lit. b DSGVO. Die Speicherung beim jeweiligen Anbieter richtet sich nach dessen Datenschutzhinweisen."
            }
          </p>
          <ul>
            <li>
              {
                "Discord: Discord Netherlands B.V., Schiphol Boulevard 195, 1118 BG Schiphol, Niederlande, und Discord Inc., 444 De Haro Street #200, San Francisco, CA 94107, USA. Discord Inc. ist unter dem EU-US Data Privacy Framework zertifiziert. Details: "
              }
              <a href="https://discord.com/privacy">
                {"Datenschutzerklärung von Discord"}
              </a>
              {"."}
            </li>
            <li>
              {
                "GitHub: GitHub, Inc., 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA. GitHub ist unter dem EU-US Data Privacy Framework zertifiziert. Details: "
              }
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
                {"Datenschutzerklärung von GitHub"}
              </a>
              {"."}
            </li>
            <li>
              {
                "Twitch: Twitch Interactive, Inc., 350 Bush Street, 2nd Floor, San Francisco, CA 94104, USA. Twitch verarbeitet Daten in den USA. Ein Angemessenheitsbeschluss oder eine DPF-Zertifizierung für Twitch konnte nicht verifiziert werden. Sie entscheiden durch die Wahl dieser Anmeldeoption, ob Sie diesen Anbieter nutzen. Details: "
              }
              <a href="https://legal.twitch.com/en/legal/privacy-notice/">
                {"Datenschutzerklärung von Twitch"}
              </a>
              {"."}
            </li>
          </ul>
        </>
      ) : (
        <>
          <p>
            {
              "Only if you choose this sign-in option are you redirected to Discord, GitHub or Twitch. The provider processes your sign-in under its own responsibility and passes your account identity to Clerk. The legal basis for your chosen sign-in is Art. 6(1)(b) GDPR. Retention by each provider follows its privacy policy."
            }
          </p>
          <ul>
            <li>
              {
                "Discord: Discord Netherlands B.V., Schiphol Boulevard 195, 1118 BG Schiphol, Netherlands, and Discord Inc., 444 De Haro Street #200, San Francisco, CA 94107, USA. Discord Inc. is certified under the EU-US Data Privacy Framework. Details: "
              }
              <a href="https://discord.com/privacy">
                {"Discord privacy policy"}
              </a>
              {"."}
            </li>
            <li>
              {
                "GitHub: GitHub, Inc., 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA. GitHub is certified under the EU-US Data Privacy Framework. Details: "
              }
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
                {"GitHub privacy statement"}
              </a>
              {"."}
            </li>
            <li>
              {
                "Twitch: Twitch Interactive, Inc., 350 Bush Street, 2nd Floor, San Francisco, CA 94104, USA. Twitch processes data in the USA. No adequacy decision or DPF certification for Twitch could be verified. You decide whether to use this provider by choosing this sign-in option. Details: "
              }
              <a href="https://legal.twitch.com/en/legal/privacy-notice/">
                {"Twitch privacy notice"}
              </a>
              {"."}
            </li>
          </ul>
        </>
      )}
    </PrivacySection>
  );
}
