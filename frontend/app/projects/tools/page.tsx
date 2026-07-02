import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/common/PageHero";
import { type ToolCard, ToolCardGrid } from "@/components/common/ToolCardGrid";

export const metadata: Metadata = {
  title: "Tools | Projects | BeastyRabbit",
  description: "Bots, integrations, and utility tools for the community.",
  openGraph: {
    title: "Tools | Projects",
    description: "Bots, integrations, and utility tools for the community.",
  },
};

const TOOLS: ToolCard[] = [
  {
    title: "Discord Bot",
    icon: "🤖",
    description:
      "Generate pixel cats, extract color palettes, and customize your experience — all from Discord slash commands.",
    href: "/projects/tools/discord-bot",
  },
  {
    title: "Stream Control",
    icon: "🎬",
    description:
      "OBS overlay for live cat gacha spins — control settings from a dashboard, spin cats on stream with animated reveals.",
    href: "/single-cat-stream",
  },
];

export default function ToolsCategory() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Tools"
        title={
          <>
            Community{" "}
            <span className="text-gradient-tools animate-shimmer bg-[length:200%_auto]">
              integrations
            </span>
          </>
        }
        description="Bots, integrations, and utility tools built for the community."
      >
        <Link
          href="/projects/tools/discord-bot"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Discord Bot <ArrowRight className="size-4" />
        </Link>
      </PageHero>

      <ToolCardGrid
        cards={TOOLS}
        titleGradientClass="group-hover:text-gradient-tools"
        hoverBorderClass="hover:border-violet-400/30"
        overlayGradientClass="from-indigo-500/5 via-transparent to-violet-500/5"
        gridClass="md:grid-cols-2"
      />
    </main>
  );
}
