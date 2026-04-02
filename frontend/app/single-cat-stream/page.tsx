import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/common/PageHero";
import { StreamControlClient } from "@/components/stream-control/StreamControlClient";

export const metadata: Metadata = {
  title: "Single Cat Stream | BeastyPage",
  description:
    "Stream control center for the Single Cat Plus gacha — spin cats live with an OBS overlay.",
};

export default function SingleCatStreamPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Stream Tools"
        title="Single Cat Stream"
        description="Control your OBS cat gacha overlay. Configure settings, trigger spins, and track results."
      />
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/80 px-6 py-4 text-sm text-muted-foreground backdrop-blur">
              <Loader2 className="size-4 animate-spin" /> Loading stream
              control…
            </div>
          </div>
        }
      >
        <StreamControlClient />
      </Suspense>
    </main>
  );
}
