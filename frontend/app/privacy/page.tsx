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
  title: "Privacy Policy | BeastyPage",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage lang="en" title="Privacy Policy" counterpart="/datenschutz">
      <p>Last updated: 21 October 2026</p>
      <ControllerSection lang="en" number={1} />
      <OverviewSection lang="en" number={2} />
      <HostingSection lang="en" number={3} />
      <LogsSection lang="en" number={4} />
      <CrowdSecSection lang="en" number={5} />
      <AccountSection lang="en" number={6} />
      <ClerkSection lang="en" number={7} />
      <OAuthSection lang="en" number={8} />
      <AnalyticsSection lang="en" number={9} />
      <OptionalRequestsSection lang="en" number={10} />
      <NineLivesSection lang="en" number={11} />
      <ExternalLinksSection lang="en" number={12} />
      <ContactSection lang="en" number={13} />
      <EmailSection lang="en" number={14} />
      <StorageSection lang="en" number={15} />
      <RightsSection lang="en" number={16} />
      <ObligationSection lang="en" number={17} />
      <ChangesSection lang="en" number={18} />
    </LegalPage>
  );
}
