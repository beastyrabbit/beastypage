import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/common/PageHero";
import { CategoryCard } from "@/components/projects/CategoryCard";
import { PROJECT_CATEGORIES } from "@/components/site-nav-config";

export const metadata: Metadata = {
  title: "Projects | BeastyRabbit",
  description:
    "Explore cat gacha tools, visual builders, artist utilities, and playful games in one hub.",
  openGraph: {
    title: "Projects | BeastyRabbit",
    description:
      "Explore cat gacha tools, visual builders, artist utilities, and playful games in one hub.",
  },
};

// Tool definitions for each category
const CATEGORY_TOOLS = {
  "warrior-cats": [
    { title: "Visual Builder", icon: "🎨" },
    { title: "Guided Builder", icon: "🧭" },
    { title: "ClanGen Explorer", icon: "📜" },
    { title: "Catdex", icon: "📖" },
  ],
  gacha: [
    { title: "Single Cat Plus", icon: "💫" },
    { title: "CatGen History", icon: "🗂️" },
    { title: "Classic Wheel", icon: "🎡" },
    { title: "Single Cat Gen", icon: "✨" },
    { title: "Adoption Gen", icon: "🐾" },
    { title: "Streamer Voting", icon: "📺" },
  ],
  artist: [
    { title: "Palette Spinner", icon: "🌀" },
    { title: "Color Palette Creator", icon: "🎨" },
    { title: "Mood Board", icon: "🎞️" },
  ],
  games: [
    { title: "Coinflip", icon: "🪙" },
    { title: "Game of Life", icon: "🧬" },
    { title: "Perfect Cat", icon: "⚖️" },
  ],
};

const CTA_LINKS = [
  {
    label: "Commission",
    href: "https://vgen.co/itthatmeowed/service/cat-adoptable-gacha/6ccd9418-a326-4335-a370-bb1009a962a6",
  },
  {
    label: "Cat Generator",
    href: "https://cgen-tools.github.io/pixel-cat-maker/",
  },
  {
    label: "itthatmeowed",
    href: "https://www.twitch.tv/itthatmeowed",
  },
];

export default function ProjectsHub() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Projects Hub"
        title={
          <>
            Tools for{" "}
            <span className="text-gradient-projects animate-shimmer bg-[length:200%_auto]">
              cat creators
            </span>
          </>
        }
        description="From gacha wheels to visual builders — pick a category and dive in."
      >
        <Link
          href="/projects/gacha"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Explore Gacha <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/projects/warrior-cats"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-6 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-1 hover:bg-foreground hover:text-background"
        >
          Warrior Cats Tools
        </Link>
      </PageHero>

      {/* Category Cards Grid */}
      <section className="grid gap-6 md:grid-cols-2">
        {PROJECT_CATEGORIES.map((category, index) => (
          <CategoryCard
            key={category.key}
            category={category}
            toolPreviews={CATEGORY_TOOLS[category.key]}
            toolCount={CATEGORY_TOOLS[category.key].length}
            index={index}
          />
        ))}
      </section>

      {/* Origin Story */}
      <section className="glass-card space-y-4 px-8 py-10">
        <div className="section-eyebrow">Origin story</div>
        <h2 className="text-3xl font-semibold text-foreground">The Story Behind This Project</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            This page started as a &quot;what if&quot; conversation about letting the generator decide a commission topic. It snowballed into a full gacha
            commission service, and I had way too much fun building out this hub to support it.
          </p>
          <p>
            What you see here is a creative playground for cat generation and chance. Every experiment or stream idea gets a tile so we can
            keep iterating, testing, and porting the legacy tools into the new stack.
          </p>
          <p>
            I&apos;m not tied to the commission revenue or stream—you won&apos;t see a kickback in any of this. It&apos;s a passion build for the community and for the joy
            of making something delightful.
          </p>
        </div>
      </section>

      {/* Quick Links */}
      <section className="flex flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 px-6 py-6 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Quick links</h2>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
          {CTA_LINKS.map((cta) => (
            <Link
              key={cta.href}
              href={cta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              {cta.label} <ExternalLink className="size-4" />
            </Link>
          ))}
        </div>
      </section>

      {/* Licenses */}
      <section className="glass-card space-y-4 px-8 py-8 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Licenses & Credits</h2>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">ClanGen Sprites</h3>
          <p>
            Cat sprites originate from ClanGen, licensed under{" "}
            <Link href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
              CC BY-NC 4.0
            </Link>
            . Credit ClanGen when you use these sprites and keep them non-commercial.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Pixel Cat Maker</h3>
          <p>
            Built on top of the{" "}
            <Link href="https://github.com/cgen-tools/pixel-cat-maker" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
              Pixel Cat Maker
            </Link>{" "}
            project (v0.12.2). Related work:{" "}
            <Link href="https://clangensim.pages.dev" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
              ClanGen Browser Simulator
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Footer */}
      <section className="flex flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 px-6 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">📢</span>
          <p>Found an issue? Ping me on Discord (if you know, you know).</p>
        </div>
        <Link
          href="/tests"
          className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
        >
          Test Pages
        </Link>
      </section>
    </main>
  );
}
