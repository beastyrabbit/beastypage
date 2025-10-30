import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";

import { HistoryClient } from "@/components/single-cat/HistoryClient";
import { PageHero } from "@/components/common/PageHero";

export const metadata: Metadata = {
  title: "CatGen History | BeastyRabbit",
  description: "Browse every saved roll, revisit timeline moments, and jump back into any build instantly.",
  openGraph: {
    title: "CatGen History",
    description: "Browse every saved roll, revisit timeline moments, and jump back into any build instantly.",
  },
};

export default function HistoryPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="History"
        title="Browse every saved roll"
        description="Filter, search, and relaunch any CatGen build in seconds."
      />
      <Suspense
        fallback={
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="glass-card flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading history…
            </div>
          </div>
        }
      >
        <HistoryClient />
      </Suspense>
    </main>
  );
}
