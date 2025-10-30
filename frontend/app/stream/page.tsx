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
        title="Things to do in my stream"
        description="Dashboards, triggers, and experiments that keep Twitch, YouTube, and Kick viewers in sync."
      >
        <Link
          href="https://twitch.tv/BeastyRabbit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:opacity-90"
        >
          Watch live <ArrowRight className="size-4" />
        </Link>
      </PageHero>

      <section className="grid gap-6 sm:grid-cols-3">
        {STREAM_FEATURES.map((feature) => {
          const isActive = Boolean(feature.href && !feature.comingSoon);
          const wrapperClassName = `transition ${
            isActive ? "hover:-translate-y-1" : "pointer-events-none opacity-60"
          }`;
          const cardContent = (
            <div className="glass-card relative overflow-hidden p-5">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-purple-500/10" role="presentation" aria-hidden="true" />
              <div className="relative flex h-full flex-col gap-3">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                  {feature.icon}
                  {feature.comingSoon ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      Coming soon
                    </span>
                  ) : null}
                </span>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
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
                className={wrapperClassName}
              >
                {cardContent}
              </Link>
            );
          }

          return (
            <div key={feature.title} className={wrapperClassName}>
              {cardContent}
            </div>
          );
        })}
      </section>

      <section className="glass-card space-y-5 px-8 py-10">
        <div className="section-eyebrow">Commands</div>
        <h2 className="text-3xl font-semibold">My best commands</h2>
        <div className="grid gap-2 text-sm text-muted-foreground">
          {COMMANDS.map((cmd) => (
            <div
              key={cmd.command}
              className="flex flex-col gap-1 rounded-2xl border border-border/50 bg-background/60 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-mono text-xs text-primary">{cmd.command}</span>
              <span className="text-xs text-muted-foreground/90">{cmd.effect}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
