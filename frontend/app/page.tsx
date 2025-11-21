import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

type HubAccent = "gatcha" | "stream" | "collection" | "personal";

type HubPillar = {
  href: string;
  title: string;
  description: string;
  accent: HubAccent;
};

type NewStuffItem = {
  href: string;
  title: string;
  description: string;
};

const HUB_THEME_CLASSES: Record<HubAccent, string> = {
  gatcha: "theme-hero theme-gatcha",
  stream: "theme-hero theme-stream",
  collection: "theme-hero theme-collection",
  personal: "theme-hero theme-personal",
};

const HUB_PILLARS: HubPillar[] = [
  {
    href: "/gatcha",
    title: "Gacha",
    description: "Catdex, premium wheel, and sprite pipeline — rebuilt with Convex.",
    accent: "gatcha",
  },
  {
    href: "/stream",
    title: "Stream Tools",
    description: "Overlay automations, chat triggers, and mod dashboards for live shows.",
    accent: "stream",
  },
  {
    href: "/collection",
    title: "Collection",
    description: "Art drops, mood boards, and archives from years of cat events.",
    accent: "collection",
  },
  {
    href: "/personal",
    title: "Personal",
    description: "Behind-the-scenes work, socials, commissions, and experiment logs.",
    accent: "personal",
  },
];

const NEW_STUFF_ITEMS: NewStuffItem[] = [
  {
    href: "/history",
    title: "CatGen history",
    description: "Browse every rollout, watch the timeline evolve, and jump straight into any build.",
  },
  {
    href: "/streamer-voting",
    title: "Streamer voting",
    description: "Host live builds with audience votes and real-time overlays.",
  },
  {
    href: "/personal",
    title: "Personal hub",
    description: "Stay-connected links, stream goals, and the latest BeastyRabbit updates in one place.",
  },
];

export const metadata: Metadata = {
  title: "Beasty Hub | BeastyRabbit Universe",
  description:
    "Explore gacha generators, stream tools, the cat collection, and personal updates from BeastyRabbit in one place.",
};

export default function HubLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero theme-gatcha relative px-8 py-12 text-balance overflow-visible">
        <div className="absolute left-1/2 top-1/2 -z-10 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px] animate-pulse-glow animate-float" />
        <div className="section-eyebrow">Beasty Hub</div>
        <h1 className="mt-4 text-5xl font-bold leading-tight sm:text-6xl md:text-7xl">
          Welcome to the <span className="text-gradient-hub animate-shimmer bg-[length:200%_auto]">BeastyVerse.</span>
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground/90 sm:text-xl leading-relaxed">
          Everything you want lives here: cat gacha tools, stream utilities, collections, personal links, and plenty more on the way.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/gatcha"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105"
          >
            Dive into Gacha <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/streamer-voting"
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-6 py-3 text-sm font-semibold text-primary transition-all hover:bg-primary/10 hover:text-primary hover:-translate-y-1"
          >
            Open Stream Voting <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HUB_PILLARS.map((pillar, index) => (
          <Link
            key={pillar.href}
            href={pillar.href}
            className={`glass-card group relative overflow-hidden p-6 transition-all hover:-translate-y-2 hover:shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`${HUB_THEME_CLASSES[pillar.accent]} absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100`} role="presentation" aria-hidden="true" />
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />
            <div className="relative flex h-full flex-col gap-4">
              <h3 className={`text-xl font-bold text-foreground group-hover:text-gradient-${pillar.accent} transition-colors`}>{pillar.title}</h3>
              <p className="text-sm text-muted-foreground group-hover:text-foreground/80 transition-colors">{pillar.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-primary transition-transform group-hover:translate-x-2">
                Explore <ArrowRight className="size-3" />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section className="glass-card space-y-8 px-8 py-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none animate-pulse-soft" />
        <div className="relative">
          <div className="section-eyebrow">New stuff</div>
          <h2 className="text-3xl font-bold mt-2">Catch up with the latest drops</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {NEW_STUFF_ITEMS.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative flex h-full flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:bg-white/10 hover:border-white/10 hover:shadow-lg"
            >
              <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary/80 transition-transform group-hover:translate-x-1 group-hover:text-primary">
                Open <ArrowRight className="size-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
