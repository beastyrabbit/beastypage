import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Bot, PlugZap, Workflow } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/common/PageHero";

type StreamFeature = {
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
  external?: boolean;
  comingSoon?: boolean;
};

type CommandRow = {
  command: string;
  effect: string;
};

const STREAM_FEATURES: StreamFeature[] = [
  {
    title: "Chat control",
    description: "Manage triggers, cooldowns, and moderation from one dashboard.",
    icon: <PlugZap className="size-4" />,
    href: "https://beastytwitch.github.io/StreamCommands/",
    external: true,
  },
  {
    title: "Chat game",
    description: "Experiments for interactive stream minigames.",
    icon: <Bot className="size-4" />,
    comingSoon: true,
  },
  {
    title: "User stats",
    description: "Profile views of stream-related stats.",
    icon: <Workflow className="size-4" />,
    comingSoon: true,
  },
];

const COMMANDS: CommandRow[] = [
  {
    command: "!roomba",
    effect: "Collect dustbunnies in chat (aliases: !clean, !vacuum).",
  },
  {
    command: "!invest",
    effect: "Open dustbunny investments (aliases: !deposit, !bank).",
  },
  {
    command: "!collect",
    effect: "Claim investment payouts (alias: !interest).",
  },
  {
    command: "!timer",
    effect: "Start a countdown by name (aliases: !countdown, !clock).",
  },
  {
    command: "!translate",
    effect: "Translate EN/DE text (alias: !tr).",
  },
];

export const metadata: Metadata = {
  title: "Stream Tools | BeastyRabbit",
  description: "Chat control, overlays, and automation experiments built for multi-platform streams.",
  openGraph: {
    title: "Stream Tools",
    description: "Chat control, overlays, and automation experiments built for multi-platform streams.",
  },
};

export default function StreamLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <PageHero
        eyebrow="Stream Operations"
        title={<>Things to do in <span className="text-gradient-stream animate-shimmer bg-[length:200%_auto]">my stream</span></>}
        description="Dashboards, triggers, and experiments that keep Twitch, YouTube, and Kick viewers in sync."
      >
        <Link
          href="https://twitch.tv/BeastyRabbit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white"></span>
          </span>
          Watch live <ArrowRight className="size-4" />
        </Link>
      </PageHero>

      <section className="grid gap-6 sm:grid-cols-3">
        {STREAM_FEATURES.map((feature, index) => {
          const isActive = Boolean(feature.href && !feature.comingSoon);
          const wrapperClassName = `transition-all duration-500 ${isActive ? "hover:-translate-y-2 hover:shadow-2xl" : "pointer-events-none opacity-60 grayscale-[0.5]"
            }`;
          const cardContent = (
            <div className="glass-card group relative overflow-hidden p-6 h-full border-emerald-500/10">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-purple-500/10 opacity-50 transition-opacity duration-500 group-hover:opacity-100" role="presentation" aria-hidden="true" />
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />

              <div className="relative flex h-full flex-col gap-4">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                  {feature.icon}
                  {feature.comingSoon ? (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                      Coming soon
                    </span>
                  ) : null}
                </span>
                <h3 className="text-xl font-bold text-foreground group-hover:text-gradient-stream transition-colors">{feature.title}</h3>
                <p className="text-sm text-muted-foreground group-hover:text-foreground/80 transition-colors">{feature.description}</p>
              </div>
            </div>
          );

          if (isActive && feature.href) {
            return (
              <Link
                key={feature.title}
                href={feature.href}
                target={feature.external ? "_blank" : undefined}
                rel={feature.external ? "noopener noreferrer" : undefined}
                className={`${wrapperClassName} animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards`}
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {cardContent}
              </Link>
            );
          }

          return (
            <div
              key={feature.title}
              className={`${wrapperClassName} animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards`}
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {cardContent}
            </div>
          );
        })}
      </section>

      <section className="glass-card space-y-6 px-8 py-10 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />
        <div className="relative z-10">
          <div className="section-eyebrow">Commands</div>
          <h2 className="text-3xl font-bold mt-2">My best commands</h2>
        </div>

        <div className="grid gap-3 font-mono text-sm">
          <div className="rounded-xl border border-white/10 bg-black/60 p-6 shadow-inner backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-muted-foreground ml-2">bash — 80x24</span>
            </div>
            <div className="space-y-3">
              {COMMANDS.map((cmd, i) => (
                <div
                  key={cmd.command}
                  className="group flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 transition-opacity hover:bg-white/5 p-1 rounded"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <span className="shrink-0 text-emerald-400 font-bold select-all">
                    <span className="text-emerald-600 mr-2">$</span>
                    {cmd.command}
                  </span>
                  <span className="text-muted-foreground group-hover:text-foreground/90 transition-colors">
                    # {cmd.effect}
                  </span>
                </div>
              ))}
              <div className="animate-pulse text-emerald-500 mt-2">_</div>
            </div>
          </div>
        </div>
      </section>
    </main >
  );
}
