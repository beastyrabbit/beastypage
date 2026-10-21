import { PrivacySection, type PrivacySectionProps } from "./privacy-section";

export function ExternalLinksSection({ lang, number }: PrivacySectionProps) {
  return (
    <PrivacySection
      number={number}
      title={
        lang === "de" ? "Links zu anderen Websites" : "Links to other websites"
      }
    >
      {lang === "de" ? (
        <p>
          {
            "Verweise auf Ko-fi, Twitch, GitHub, YouTube, X, Bluesky und andere Websites sind einfache Links. Eine Datenübermittlung an das verlinkte Ziel erfolgt erst, wenn Sie den Link anklicken. Anschließend gelten die Datenschutzhinweise des jeweiligen Anbieters."
          }
        </p>
      ) : (
        <p>
          {
            "Links to Ko-fi, Twitch, GitHub, YouTube, X, Bluesky and other websites are plain links. Data is transmitted to the linked destination only when you click. The respective provider's privacy policy then applies."
          }
        </p>
      )}
    </PrivacySection>
  );
}
