import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { Metadata } from "next";

import HostClient from "@/components/streamer/HostClient";
import { PageHero } from "@/components/common/PageHero";

export const metadata: Metadata = {
  title: "Streamer Voting Build | BeastyRabbit",
  description: "Run live cat builder sessions with audience voting and automated overlays.",
  openGraph: {
    title: "Streamer Voting Build",
    description: "Run live cat builder sessions with audience voting and automated overlays.",
  },
};

export default function StreamerVotingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
      <PageHero
        eyebrow="Streamer Tools"
        title="Live voting control center"
        description="Queue cat prompts, let chat pick traits, and publish the winning build in real time."
      />
      <Suspense
        fallback={
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="glass-card flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading stream control center…
            </div>
          </div>
        }
      >
        <HostClient />
      </Suspense>
    </main>
  );
}
