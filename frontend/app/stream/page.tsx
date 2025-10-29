import Link from "next/link";
import { ArrowRight, Binary, Bot, PlugZap, Workflow } from "lucide-react";

const STREAM_FEATURES = [
  {
    title: "Overlay control",
    description: "Convex state drives overlays for wheel spins, cat reveals, and alerts.",
    icon: <PlugZap className="size-4" />,
  },
  {
    title: "Chat triggers",
    description: "Twitch, Kick, and YouTube commands fan out through the same mutation queue.",
    icon: <Bot className="size-4" />,
  },
  {
    title: "Automation",
    description: "Scheduled events, donation bonuses, and special scenes powered by scripts.",
    icon: <Workflow className="size-4" />,
  },
];

const COMMANDS = [
  { command: "!wheel", effect: "Queue a premium wheel spin" },
  { command: "!catdex {name}", effect: "Lookup a cat in the database" },
  { command: "!drop", effect: "Trigger item drops once cooldown expires" },
  { command: "!mods", effect: "Summon the mod dashboard link" },
];

export default function StreamLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero theme-stream px-8 py-12 text-balance">
        <div className="section-eyebrow">Stream Operations</div>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl md:text-6xl">
          Neon overlays, multi-platform bots, and real-time automation.
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
          The stream stack is migrating to Convex so triggers, overlays, and moderation tools share one source of truth. Everything is tuned to work across Twitch, Kick, and YouTube with room for growth.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="https://twitch.tv/BeastyRabbit"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:translate-y-0.5 hover:opacity-90"
          >
            Watch live <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/gatcha"
            className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            Gatcha systems
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {STREAM_FEATURES.map((feature) => (
          <div key={feature.title} className="glass-card relative overflow-hidden p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-purple-500/10" aria-hidden />
            <div className="relative flex h-full flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                {feature.icon}
              </span>
              <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="glass-card grid gap-8 px-8 py-10 lg:grid-cols-[1.3fr,1fr]">
        <div className="space-y-5">
          <div className="section-eyebrow">Commands</div>
          <h2 className="text-3xl font-semibold">Universal chat triggers</h2>
          <p className="text-sm text-muted-foreground">
            Commands sync through the Convex queue so each platform remains in lockstep. Cooldowns, permissions, and overlays will move to the new dashboard.
          </p>
          <div className="grid gap-2 text-sm text-muted-foreground">
            {COMMANDS.map((cmd) => (
              <div key={cmd.command} className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/60 px-4 py-2">
                <span className="font-mono text-xs text-primary">{cmd.command}</span>
                <span className="text-xs">{cmd.effect}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="glass-card space-y-4 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Binary className="size-4 text-primary" />
            Overlay architecture
          </div>
          <p className="text-sm text-muted-foreground">
            Websocket bridge will be replaced with Convex actions. Scenes, alerts, and queue updates can be inspected directly in the dashboard, easing debugging mid-stream.
          </p>
          <Link
            href="https://github.com/BeastyTwitch"
            target="_blank"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-foreground/30 px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            View overlay repo <ArrowRight className="size-3" />
          </Link>
        </aside>
      </section>
    </main>
  );
}
