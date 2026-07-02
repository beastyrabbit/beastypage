import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/common/PageHero";
import { type ToolCard, ToolCardGrid } from "@/components/common/ToolCardGrid";

export const metadata: Metadata = {
  title: "Artist Tools | Projects | BeastyRabbit",
  description:
    "Palettes, mood boards, and creative inspiration tools for artists.",
  openGraph: {
    title: "Artist Tools | Projects",
    description:
      "Palettes, mood boards, and creative inspiration tools for artists.",
  },
};

const TOOLS: ToolCard[] = [
  {
    title: "Palette Generator",
    icon: "✨",
    description:
      "Generate harmonious color palettes instantly. Build a collection and export in multiple formats.",
    href: "/palette-generator",
  },
  {
    title: "Color Palette Creator",
    icon: "🎨",
    description:
      "Extract dominant colors from images. Drag crosshairs to pick colors, hover to highlight regions.",
    href: "/color-palette-creator",
  },
  {
    title: "Pixelator",
    icon: "🔲",
    description:
      "Transform images with a modular pixel art pipeline. Chain pixelation, dithering, quantization, and effects.",
    href: "/pixelator",
  },
  {
    title: "Cat Color Palettes",
    icon: "🐱",
    description:
      "Browse all experimental color palettes for cat generation including anime-inspired themes.",
    href: "/cat-color-palettes",
  },
  {
    title: "Mood Board",
    icon: "🎞️",
    description:
      "Unsplash powered inspiration board with dramatic elimination and rolling credits.",
    comingSoon: true,
    statusLabel: "Was not allowed",
  },
];

export default function ArtistCategory() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Artist Tools"
        title={
          <>
            Fuel your{" "}
            <span className="text-gradient-artist animate-shimmer bg-[length:200%_auto]">
              creativity
            </span>
          </>
        }
        description="Palettes, mood boards, and inspiration tools designed for artists."
      >
        <Link
          href="/palette-generator"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Open Palette Generator <ArrowRight className="size-4" />
        </Link>
      </PageHero>

      <ToolCardGrid
        cards={TOOLS}
        titleGradientClass="group-hover:text-gradient-artist"
        hoverBorderClass="hover:border-purple-400/30"
        overlayGradientClass="from-purple-500/5 via-transparent to-pink-500/5"
        gridClass="md:grid-cols-2"
      />
    </main>
  );
}
