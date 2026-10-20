import type { Metadata } from "next";

import { PageHero } from "@/components/common/PageHero";
import { ScenePlannerClient } from "@/components/scene-planner/ScenePlannerClient";

export const metadata: Metadata = {
  title: "Scene Planner | Artist Tools | BeastyRabbit",
  description:
    "Roll an illustration background on a grid: board game dice, gacha reels or hand-placed pixel tiles, with depth zones and a foreground overlay.",
  openGraph: {
    title: "Scene Planner | Artist Tools",
    description:
      "Roll an illustration background on a grid, like a board game.",
  },
};

export default function ScenePlannerPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Artist Tools"
        title={
          <span className="text-gradient-artist animate-shimmer bg-[length:200%_auto]">
            Scene Planner
          </span>
        }
        description="Roll a background like a board game: category, variant, then where it lands. Lay your character on top so hidden cells are skipped."
      />
      <ScenePlannerClient />
    </main>
  );
}
