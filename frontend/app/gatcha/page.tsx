"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useCallback } from "react";

type LegacyCard = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  badge?: string;
  comingSoon?: boolean;
  statusLabel?: string;
};

const LEGACY_MODE_CARDS: LegacyCard[] = [
  {
    title: "Single Cat Plus",
    icon: "💫",
    description:
      "Generate, spin, and export pixel cats with layered accessories and tortie coats.",
    href: "/single-cat-plus",
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
    title: "Catdex",
    icon: "📖",
    description:
      "Browse, search, and filter every cat in a Pokédex-style archive.",
    href: "/catdex",
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
    description:
      "Calm typewriter-style reveal where traits appear one by one.",
    href: "/single-cat-plus?mode=calm",
  },
  {
    title: "Adoption Generator",
    icon: "🐾",
    description:
      "Roll whole litters, trim each round, and finish with your top ten cats.",
    href: "/adoption-generator",
  },
  {
    title: "Mood Board",
    icon: "🎞️",
    description:
      "Unsplash powered inspiration board with dramatic elimination and rolling credits.",
    comingSoon: true,
    statusLabel: "Was not allowed",
  },
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
    title: "Streamer Voting Build",
    icon: "📺",
    description:
      "Live session controls for audience voting and shareable builds.",
    href: "/streamer-voting",
  },
  {
    title: "Perfect Cat Finder",
    icon: "⚖️",
    description:
      "Head-to-head comparisons that evolve toward your favourite cat.",
    href: "/perfect-cat-finder",
  },
  {
    title: "ClanGen History Explorer",
    icon: "📜",
    description:
      "Interactive timeline, family trees, and profiles from ClanGen save files.",
    comingSoon: true,
  },
  {
    title: "Palette Spinner",
    icon: "🌀",
    description:
      "Spin through colour palettes with smooth transitions and range controls.",
    href: "/palette-spinner",
  },
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
];

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

export default function GatchaLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Cat Gacha Platform</p>
        <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl md:text-6xl">
          Gold-standard gatcha experience
        </h1>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/catdex"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:translate-y-0.5 hover:opacity-90"
          >
            Browse Catdex <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/single-cat-plus"
            className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            Cat generator
          </Link>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {LEGACY_MODE_CARDS.map((card) => {
          const isActive = !card.comingSoon && !!card.href;
          const baseClasses = "relative flex h-full flex-col gap-3 rounded-3xl border bg-background/80 p-6 transition shadow-inner";
          const activeClasses = "border-border/50 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl";
          const inactiveClasses = "border-border/50 cursor-not-allowed opacity-70";
          const overlayActive = "absolute inset-0 -z-10 rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(253,230,138,0.22),_transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(250,204,21,0.18),_transparent_60%),linear-gradient(135deg,_rgba(253,230,138,0.12),_rgba(217,119,6,0.05))]";
          const overlayInactive = "absolute inset-0 -z-10 rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.16),_transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(71,85,105,0.14),_transparent_60%),linear-gradient(135deg,_rgba(148,163,184,0.08),_rgba(30,41,59,0.05))]";

          const content = (
            <>
              <span className={isActive ? overlayActive : overlayInactive} aria-hidden />
              {card.badge && (
                <span className="absolute right-4 top-4 rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                  {card.badge}
                </span>
              )}
              {card.comingSoon && (
                <span className="absolute right-4 top-4 rounded-full bg-primary/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {card.statusLabel ?? "Coming soon"}
                </span>
              )}
              <div className="text-3xl" aria-hidden>
                {card.icon}
              </div>
              <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
              <p className="text-sm text-muted-foreground">{card.description}</p>
            </>
          );

          if (isActive && card.href) {
            return (
              <Link key={card.title} href={card.href} className={`${baseClasses} ${activeClasses}`}>
                {content}
              </Link>
            );
          }

          return (
            <div key={card.title} role="article" className={`${baseClasses} ${inactiveClasses}`}>
              {content}
            </div>
          );
        })}
      </section>

      <section className="glass-card space-y-4 px-8 py-10">
        <div className="section-eyebrow">Origin story</div>
        <h2 className="text-3xl font-semibold text-foreground">The Story Behind This Project</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            This page started as a “what if” conversation about letting the generator decide a commission topic. It snowballed into a full gatcha
            commission service, and I had way too much fun building out this hub to support it.
          </p>
          <p>
            What you see above is a creative playground for cat generation and chance. Every experiment or stream idea gets a tile in the grid so we can
            keep iterating, testing, and porting the legacy tools into the new stack.
          </p>
          <p>
            I&apos;m not tied to the commission revenue or stream—you won&apos;t see a kickback in any of this. It&apos;s a passion build for the community and for the joy
            of making something delightful.
          </p>
        </div>
      </section>

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

      <section className="flex flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 px-6 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">📢</span>
          <p>Found an issue? Ping me on Discord (if you know, you know).</p>
        </div>
        <Link
          href="/tests"
          className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
        >
          🧪 Test Pages
        </Link>
      </section>
    </main>
  );
}
