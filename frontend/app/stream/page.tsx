import Link from "next/link";
import { ArrowRight, Binary, Bot, PlugZap, Workflow } from "lucide-react";

const STREAM_FEATURES = [
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

const COMMANDS = [
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

export default function StreamLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero theme-stream px-8 py-12 text-balance">
        <div className="section-eyebrow">Stream Operations</div>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl md:text-6xl">
          Things to do in my stream
        </h1>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="https://twitch.tv/BeastyRabbit"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:translate-y-0.5 hover:opacity-90"
          >
            Watch live <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {STREAM_FEATURES.map((feature) => {
          const cardContent = (
            <div className="glass-card relative overflow-hidden p-5">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-purple-500/10" aria-hidden />
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

          if (feature.href && !feature.comingSoon) {
            return (
              <Link
                key={feature.title}
                href={feature.href}
                target={feature.external ? "_blank" : undefined}
                rel={feature.external ? "noopener noreferrer" : undefined}
                className="transition hover:-translate-y-1"
              >
                {cardContent}
              </Link>
            );
          }

          return (
            <div key={feature.title} className={!feature.comingSoon ? "" : "opacity-60"}>
              {cardContent}
            </div>
          );
        })}
      </section>

      <section className="glass-card grid gap-8 px-8 py-10 lg:grid-cols-[1.3fr,1fr]">
        <div className="space-y-5">
          <div className="section-eyebrow">Commands</div>
          <h2 className="text-3xl font-semibold">My best commands</h2>
          <div className="grid gap-2 text-sm text-muted-foreground">
            {COMMANDS.map((cmd) => (
              <div key={cmd.command} className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/60 px-4 py-2">
                <span className="font-mono text-xs text-primary">{cmd.command}</span>
                <span className="text-xs">{cmd.effect}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="glass-card space-y-4 p-6" aria-hidden />
      </section>
    </main>
  );
}
