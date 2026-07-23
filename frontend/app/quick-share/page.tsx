import type { Metadata } from "next";
import { QuickShareClient } from "@/components/quick-share/QuickShareClient";

export const metadata: Metadata = {
  title: "Quick Share | BeastyRabbit",
  description: "Create a temporary media link for chat.",
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

export default function QuickSharePage() {
  return <QuickShareClient />;
}
