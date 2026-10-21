import type { Metadata } from "next";
import { AccountSection } from "@/components/legal/account-section";
import { AnalyticsSection } from "@/components/legal/analytics-section";
import { ChangesSection } from "@/components/legal/changes-section";
import { ClerkSection } from "@/components/legal/clerk-section";
import { ContactSection } from "@/components/legal/contact-section";
import { ControllerSection } from "@/components/legal/controller-section";
import { CrowdSecSection } from "@/components/legal/crowdsec-section";
import { EmailSection } from "@/components/legal/email-section";
import { ExternalLinksSection } from "@/components/legal/external-links-section";
import { HostingSection } from "@/components/legal/hosting-section";
import { LegalPage } from "@/components/legal/legal-page";
import { LogsSection } from "@/components/legal/logs-section";
import { NineLivesSection } from "@/components/legal/nine-lives-section";
import { OAuthSection } from "@/components/legal/oauth-section";
import { ObligationSection } from "@/components/legal/obligation-section";
import { OptionalRequestsSection } from "@/components/legal/optional-requests-section";
import { OverviewSection } from "@/components/legal/overview-section";
import { RightsSection } from "@/components/legal/rights-section";
import { StorageSection } from "@/components/legal/storage-section";

export const metadata: Metadata = {
  title: "Datenschutzerklärung | BeastyPage",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage lang="de" title="Datenschutzerklärung" counterpart="/privacy">
      <p>Stand: 21. Oktober 2026</p>
      <ControllerSection lang="de" number={1} />
      <OverviewSection lang="de" number={2} />
      <HostingSection lang="de" number={3} />
      <LogsSection lang="de" number={4} />
      <CrowdSecSection lang="de" number={5} />
      <AccountSection lang="de" number={6} />
      <ClerkSection lang="de" number={7} />
      <OAuthSection lang="de" number={8} />
      <AnalyticsSection lang="de" number={9} />
      <OptionalRequestsSection lang="de" number={10} />
      <NineLivesSection lang="de" number={11} />
      <ExternalLinksSection lang="de" number={12} />
      <ContactSection lang="de" number={13} />
      <EmailSection lang="de" number={14} />
      <StorageSection lang="de" number={15} />
      <RightsSection lang="de" number={16} />
      <ObligationSection lang="de" number={17} />
      <ChangesSection lang="de" number={18} />
    </LegalPage>
  );
}
