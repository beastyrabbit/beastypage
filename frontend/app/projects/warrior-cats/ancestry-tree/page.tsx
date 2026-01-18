import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { PageHero } from "@/components/common/PageHero";
import { AncestryTreeClient } from "@/components/ancestry-tree";

export const metadata: Metadata = {
  title: "Ancestry Tree | Warrior Cats | BeastyRabbit",
  description:
    "Create interactive family trees for your warrior cats. Watch generations unfold with inherited traits and explore relationships.",
  openGraph: {
    title: "Ancestry Tree | Warrior Cats",
    description:
      "Create interactive family trees for your warrior cats with trait inheritance.",
  },
};

export default function AncestryTreePage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <Link
          href="/projects/warrior-cats"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Warrior Cats
        </Link>

        <Link
          href="/history"
          className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
        >
          <History className="size-4" />
          View History
        </Link>
      </div>

      <PageHero
        eyebrow="Ancestry Tree"
        title={
          <>
            Build your{" "}
            <span className="text-gradient-warrior-cats animate-shimmer bg-[length:200%_auto]">
              family tree
            </span>
          </>
        }
        description="Create a founding couple and watch their lineage unfold across generations. Each kit inherits traits from their parents through a genetic system."
      />

      <AncestryTreeClient />
    </main>
  );
}
