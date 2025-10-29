import Link from "next/link";
import { ArrowRight } from "lucide-react";

const HUB_PILLARS = [
  {
    href: "/gatcha",
    title: "Gatcha",
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

const NEW_STUFF_ITEMS = [
  {
    href: "/history",
    title: "CatGen history",
    description: "Browse every rollout, watch the timeline evolve, and jump straight into any build.",
  },
  {
    href: "/personal",
    title: "Personal hub",
    description: "Find stay-connected links, stream goals, and the latest BeastyRabbit updates in one place.",
  },
];

export default function HubLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero theme-gatcha px-8 py-12 text-balance">
        <div className="section-eyebrow">Beasty Hub</div>
        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
          Welcome to the BeastyVerse.
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground sm:text-xl">
          Everything you want lives here: cat gatchas, stream tools, collections, personal links, and plenty more on the way.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/gatcha"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:translate-y-0.5 hover:opacity-90"
          >
            Dive into Gatcha <ArrowRight className="size-4" />
          </Link>
          <Link
            href="https://discord.gg/convex"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            Join the build channel
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HUB_PILLARS.map((pillar) => (
          <Link
            key={pillar.href}
            href={pillar.href}
            className={`glass-card relative overflow-hidden p-5 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl`}
          >
            <div className={`theme-hero theme-${pillar.accent} absolute inset-0 opacity-60`} aria-hidden />
            <div className="relative flex h-full flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                {pillar.title}
              </span>
              <h3 className="text-lg font-semibold text-foreground">{pillar.title}</h3>
              <p className="text-sm text-muted-foreground">{pillar.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Explore <ArrowRight className="size-3" />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section className="glass-card space-y-6 px-8 py-10">
        <div className="section-eyebrow">New stuff</div>
        <h2 className="text-3xl font-semibold">Catch up with the latest drops</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {NEW_STUFF_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="glass-card relative flex h-full flex-col gap-3 p-5 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                {item.title}
              </span>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Open <ArrowRight className="size-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
