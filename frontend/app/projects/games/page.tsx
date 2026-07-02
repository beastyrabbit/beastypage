import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/common/PageHero";
import { type ToolCard, ToolCardGrid } from "@/components/common/ToolCardGrid";

export const metadata: Metadata = {
  title: "Games | Projects | BeastyRabbit",
  description: "Interactive challenges and playful experiments with cats.",
  openGraph: {
    title: "Games | Projects",
    description: "Interactive challenges and playful experiments with cats.",
  },
};

const TOOLS: ToolCard[] = [
  {
    title: "Coinflip Challenge",
    icon: "🪙",
    description:
      "Head-to-head luck arena. Wager cats, call the flip, and earn bragging rights.",
    href: "/coinflip",
  },
  {
    title: "Cat Game of Life Mix",
    icon: "🧬",
    description:
      "Conway-inspired sandbox where pixel cats grow, merge, and fade in endless combinations.",
    comingSoon: true,
  },
  {
    title: "Perfect Cat Finder",
    icon: "⚖️",
    description:
      "Head-to-head comparisons that evolve toward your favourite cat.",
    href: "/perfect-cat-finder",
  },
];

export default function GamesCategory() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Games"
        title={
          <>
            Play with{" "}
            <span className="text-gradient-games animate-shimmer bg-[length:200%_auto]">
              pixels
            </span>
          </>
        }
        description="Interactive challenges and playful experiments featuring pixel cats."
      >
        <Link
          href="/coinflip"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Play Coinflip <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/perfect-cat-finder"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-6 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-1 hover:bg-foreground hover:text-background"
        >
          Perfect Cat Finder
        </Link>
      </PageHero>

      <ToolCardGrid
        cards={TOOLS}
        titleGradientClass="group-hover:text-gradient-games"
        hoverBorderClass="hover:border-cyan-400/30"
        overlayGradientClass="from-cyan-500/5 via-transparent to-teal-500/5"
      />
    </main>
  );
}
