import type { Metadata } from "next";
import { QuickShareModerationClient } from "@/components/quick-share/QuickShareModerationClient";

export const metadata: Metadata = {
  title: "Quick Share Moderation | BeastyRabbit",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
    },
  },
};

export default function QuickShareModerationPage() {
  return <QuickShareModerationClient />;
}
