import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

const localizedCopy = {
  de: {
    title: "Anmeldung mit Discord, GitHub oder Twitch",
    introduction:
      "Nur wenn Sie diese Anmeldeoption wählen, werden Sie zu Discord, GitHub oder Twitch weitergeleitet. Der Anbieter verarbeitet Ihre Anmeldung eigenverantwortlich und übermittelt Ihre Kontoidentität an Clerk. Rechtsgrundlage für die von Ihnen gewählte Anmeldung ist Art. 6 Abs. 1 lit. b DSGVO. Die Speicherung beim jeweiligen Anbieter richtet sich nach dessen Datenschutzhinweisen.",
    providers: [
      {
        name: "Discord",
        entity:
          "Discord Netherlands B.V., Schiphol Boulevard 195, 1118 BG Schiphol, Niederlande, und Discord Inc., 444 De Haro Street #200, San Francisco, CA 94107, USA.",
        transfer:
          "Discord Inc. ist unter dem EU-US Data Privacy Framework zertifiziert. Details: ",
        policyLabel: "Datenschutzerklärung von Discord",
        policyUrl: "https://discord.com/privacy",
      },
      {
        name: "GitHub",
        entity:
          "GitHub, Inc., 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA.",
        transfer:
          "GitHub ist unter dem EU-US Data Privacy Framework zertifiziert. Details: ",
        policyLabel: "Datenschutzerklärung von GitHub",
        policyUrl:
          "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
      },
      {
        name: "Twitch",
        entity:
          "Twitch Interactive, Inc., 350 Bush Street, 2nd Floor, San Francisco, CA 94104, USA.",
        transfer:
          "Twitch verarbeitet Daten in den USA. Ein Angemessenheitsbeschluss oder eine DPF-Zertifizierung für Twitch konnte nicht verifiziert werden. Sie entscheiden durch die Wahl dieser Anmeldeoption, ob Sie diesen Anbieter nutzen. Details: ",
        policyLabel: "Datenschutzerklärung von Twitch",
        policyUrl: "https://legal.twitch.com/en/legal/privacy-notice/",
      },
    ],
  },
  en: {
    title: "Sign-in with Discord, GitHub or Twitch",
    introduction:
      "Only if you choose this sign-in option are you redirected to Discord, GitHub or Twitch. The provider processes your sign-in under its own responsibility and passes your account identity to Clerk. The legal basis for your chosen sign-in is Art. 6(1)(b) GDPR. Retention by each provider follows its privacy policy.",
    providers: [
      {
        name: "Discord",
        entity:
          "Discord Netherlands B.V., Schiphol Boulevard 195, 1118 BG Schiphol, Netherlands, and Discord Inc., 444 De Haro Street #200, San Francisco, CA 94107, USA.",
        transfer:
          "Discord Inc. is certified under the EU-US Data Privacy Framework. Details: ",
        policyLabel: "Discord privacy policy",
        policyUrl: "https://discord.com/privacy",
      },
      {
        name: "GitHub",
        entity:
          "GitHub, Inc., 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA.",
        transfer:
          "GitHub is certified under the EU-US Data Privacy Framework. Details: ",
        policyLabel: "GitHub privacy statement",
        policyUrl:
          "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
      },
      {
        name: "Twitch",
        entity:
          "Twitch Interactive, Inc., 350 Bush Street, 2nd Floor, San Francisco, CA 94104, USA.",
        transfer:
          "Twitch processes data in the USA. No adequacy decision or DPF certification for Twitch could be verified. You decide whether to use this provider by choosing this sign-in option. Details: ",
        policyLabel: "Twitch privacy notice",
        policyUrl: "https://legal.twitch.com/en/legal/privacy-notice/",
      },
    ],
  },
} as const;

export function OAuthSection({ lang, number }: PrivacySectionProps) {
  const copy = localizedCopy[lang];
  return (
    <PrivacySection number={number} title={copy.title}>
      <p>{copy.introduction}</p>
      <ul>
        {copy.providers.map((provider) => (
          <li key={provider.name}>
            {`${provider.name}: ${provider.entity} ${provider.transfer}`}
            <a href={provider.policyUrl}>{provider.policyLabel}</a>
            {"."}
          </li>
        ))}
      </ul>
    </PrivacySection>
  );
}
