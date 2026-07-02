import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/common/PageHero";
import { type ToolCard, ToolCardGrid } from "@/components/common/ToolCardGrid";

export const metadata: Metadata = {
  title: "Gacha Tools | Projects | BeastyRabbit",
  description: "Wheels, generators, and chance-based cat creation tools.",
  openGraph: {
    title: "Gacha Tools | Projects",
    description: "Wheels, generators, and chance-based cat creation tools.",
  },
};

const TOOLS: ToolCard[] = [
  {
    title: "Single Cat Plus",
    icon: "💫",
    description:
      "Generate, spin, and export pixel cats with layered accessories and tortie coats.",
    href: "/single-cat-plus",
  },
  {
    title: "Single Cat Generator",
    icon: "✨",
    description:
      "Airport flip-board chaos with rapid spins before the final reveal.",
    href: "/single-cat-plus?mode=flashy&accessories=1-1&scars=1-1&torties=1-1&afterlife=off",
  },
  {
    title: "Single Cat (Less Spin)",
    icon: "🎯",
    description: "Calm typewriter-style reveal where traits appear one by one.",
    href: "/single-cat-plus?mode=calm",
  },
  {
    title: "Cat Settings",
    icon: "⚙️",
    description:
      "Configure and share cat generation presets with a 6-word code.",
    href: "/single-cat-plus/settings",
  },
  {
    title: "CatGen History",
    icon: "🗂️",
    description:
      "Browse every stored roll, names, and sprites in a lightweight history viewer.",
    href: "/history",
  },
  {
    title: "Classic Wheel",
    icon: "🎡",
    description:
      "Weighted wheel with animated reveals and celebratory effects.",
    href: "/wheel",
  },
  {
    title: "Adoption Generator",
    icon: "🐾",
    description:
      "Roll whole litters, trim each round, and finish with your top ten cats.",
    href: "/adoption-generator",
  },
  {
    title: "Evolution Lines",
    icon: "🌿",
    description:
      "Start with one cat, then branch it into evolution forms with cumulative torties, scars, and accessories.",
    href: "/evolution-generator",
  },
  {
    title: "Streamer Voting Build",
    icon: "📺",
    description:
      "Live session controls for audience voting and shareable builds.",
    href: "/streamer-voting",
  },
];

export default function GachaCategory() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Gacha Tools"
        title={
          <>
            Spin, roll, and{" "}
            <span className="text-gradient-gacha animate-shimmer bg-[length:200%_auto]">
              discover
            </span>
          </>
        }
        description="Wheels, generators, and adoption mechanics for chance-based cat creation."
      >
        <Link
          href="/single-cat-plus"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Open Single Cat Plus <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/catdex"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-6 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-1 hover:bg-foreground hover:text-background"
        >
          Browse Catdex
        </Link>
      </PageHero>

      <ToolCardGrid
        cards={TOOLS}
        titleGradientClass="group-hover:text-gradient-gacha"
        hoverBorderClass="hover:border-amber-400/30"
        overlayGradientClass="from-amber-500/5 via-transparent to-orange-500/5"
      />
    </main>
  );
}
