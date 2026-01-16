import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/common/PageHero";

type ToolCard = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  comingSoon?: boolean;
  statusLabel?: string;
};

export const metadata: Metadata = {
  title: "Gacha Tools | Projects | BeastyRabbit",
  description:
    "Wheels, generators, and chance-based cat creation tools.",
  openGraph: {
    title: "Gacha Tools | Projects",
    description:
      "Wheels, generators, and chance-based cat creation tools.",
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

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((card, index) => {
          const isActive = Boolean(!card.comingSoon && card.href);
          const baseClasses = "glass-card relative flex h-full flex-col gap-4 p-6 transition-all duration-500 overflow-hidden group";
          const wrapperClassName = isActive
            ? `${baseClasses} hover:-translate-y-2 hover:shadow-2xl hover:border-amber-400/30`
            : `${baseClasses} opacity-70 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 animate-pulse-soft`;

          const content = (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" role="presentation" aria-hidden="true" />
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />

              <div className="flex items-start justify-between">
                <div className="text-4xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" aria-hidden>
                  {card.icon}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {card.comingSoon && (
                    <span className="rounded-full bg-primary/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary shadow-[0_0_10px_rgba(236,72,153,0.2)]">
                      {card.statusLabel ?? "Coming soon"}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-xl font-bold text-foreground group-hover:text-gradient-gacha transition-colors">{card.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors">{card.description}</p>
              </div>

              {isActive && (
                <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-primary transition-transform group-hover:translate-x-2 pt-2">
                  Launch Tool <ArrowRight className="size-3" />
                </span>
              )}
            </>
          );

          if (isActive && card.href) {
            return (
              <Link
                key={card.title}
                href={card.href}
                className={`${wrapperClassName} animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={card.title}
              className={`${wrapperClassName} animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {content}
            </div>
          );
        })}
      </section>
    </main>
  );
}
