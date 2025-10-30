import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";

import { GuidedBuilderClient } from "@/components/guided-builder/GuidedBuilderClient";
import { PageHero } from "@/components/common/PageHero";

export const metadata: Metadata = {
  title: "Guided Builder Tour",
  description: "Step-by-step wizard that walks you through building the perfect cat using the V3 renderer.",
};

export default function GuidedBuilderPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Guided Tour"
        title="Build your cat one thoughtful step at a time"
        description="Follow the wizard to pick palettes, tweaks, and renders without leaving the builder."
      />
      <Suspense
        fallback={
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="glass-card flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading guided builder…
            </div>
          </div>
        }
      >
        <GuidedBuilderClient />
      </Suspense>
    </main>
  );
}
