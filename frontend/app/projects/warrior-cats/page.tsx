import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/common/PageHero";
import { type ToolCard, ToolCardGrid } from "@/components/common/ToolCardGrid";

export const metadata: Metadata = {
  title: "Warrior Cats Tools | Projects | BeastyRabbit",
  description:
    "Visual builders, guided creation, and ClanGen-inspired tools for warrior cat creators.",
  openGraph: {
    title: "Warrior Cats Tools | Projects",
    description:
      "Visual builders, guided creation, and ClanGen-inspired tools for warrior cat creators.",
  },
};

const TOOLS: ToolCard[] = [
  {
    title: "Visual Cat Builder",
    icon: "🎨",
    description:
      "Trait-by-trait sprite previews with instant updates while you build.",
    href: "/visual-builder",
  },
  {
    title: "Guided Builder Tour",
    icon: "🧭",
    description:
      "Step-by-step wizard with a growing sidebar tree and timeline tracking.",
    href: "/guided-builder",
  },
  {
    title: "Ancestry Tree",
    icon: "🌳",
    description:
      "Create interactive family trees with trait inheritance across generations.",
    href: "/projects/warrior-cats/ancestry-tree",
  },
  {
    title: "Catdex",
    icon: "📖",
    description:
      "Browse, search, and filter every cat in a Pokedex-style archive.",
    href: "/catdex",
  },
];

export default function WarriorCatsCategory() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Warrior Cats"
        title={
          <>
            Build your{" "}
            <span className="text-gradient-warrior-cats animate-shimmer bg-[length:200%_auto]">
              clan
            </span>
          </>
        }
        description="Visual builders, guided creation tools, and ClanGen-inspired utilities for warrior cat enthusiasts."
      >
        <Link
          href="/visual-builder"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Open Visual Builder <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/guided-builder"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-6 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-1 hover:bg-foreground hover:text-background"
        >
          Guided Builder
        </Link>
      </PageHero>

      <ToolCardGrid
        cards={TOOLS}
        titleGradientClass="group-hover:text-gradient-warrior-cats"
        hoverBorderClass="hover:border-amber-600/30"
        overlayGradientClass="from-amber-700/5 via-transparent to-emerald-800/5"
        gridClass="md:grid-cols-2"
      />
    </main>
  );
}
