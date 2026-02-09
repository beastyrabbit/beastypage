import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/common/PageHero";

const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1470478917776441416&scope=applications.commands&permissions=0";

export const metadata: Metadata = {
  title: "Discord Bot | Tools | BeastyRabbit",
  description:
    "Generate pixel cats, extract color palettes, and customize your experience — all from Discord slash commands.",
  openGraph: {
    title: "Discord Bot | BeastyRabbit",
    description:
      "Generate pixel cats, extract color palettes, and customize your experience — all from Discord slash commands.",
  },
};

const COMMANDS = [
  {
    name: "/gen-discord-kitten",
    icon: "🐱",
    description:
      "Generate a unique pixel cat — pick your sprite, pelt, colour, eyes, and shading, or let it randomize.",
  },
  {
    name: "/palette",
    icon: "🎨",
    description: (
      <>
        Extract a color palette from any image.{" "}
        <span className="font-bold text-gradient-tools animate-shimmer bg-[length:200%_auto]">
          Also available as a right-click context menu action.
        </span>
      </>
    ),
  },
  {
    name: "/config",
    icon: "🔧",
    description:
      "Manage your generation preferences — accessories, scars, torties, palettes, dark forest, and more.",
  },
  {
    name: "/homepage",
    icon: "🏠",
    description:
      "Quick link back to beastyrabbit.com — share the site with your server.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Add to your server",
    description:
      "Click the button above to invite the bot. No special permissions needed — it uses slash commands only.",
  },
  {
    step: "2",
    title: "Generate and explore",
    description:
      "Use /gen-discord-kitten to generate cats or /palette on any image to extract colors. Results appear instantly.",
  },
  {
    step: "3",
    title: "Make it yours",
    description:
      "Customize with /config — set palettes, accessories, dark forest mode, and more. Preferences are saved per user.",
  },
];

const CONFIG_FEATURES = [
  { label: "34 color palettes", detail: "Base, anime-themed, and nature" },
  { label: "Accessories & scars", detail: "Range control from 0 to 4" },
  { label: "Tortie range", detail: "Control tortoiseshell pattern intensity" },
  { label: "Dark Forest mode", detail: "Toggle dark forest cat generation" },
  { label: "StarClan toggle", detail: "Generate ghostly StarClan cats" },
  { label: "Per-user preferences", detail: "Saved across all your servers" },
];

export default function DiscordBotPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <PageHero
        eyebrow="Discord Bot"
        title={
          <>
            Pixel cats in your{" "}
            <span className="text-gradient-tools animate-shimmer bg-[length:200%_auto]">
              Discord
            </span>
          </>
        }
        description="Generate unique pixel cats, extract color palettes from images, and customize every detail — all through slash commands."
      >
        <Link
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Add to Server <ExternalLink className="size-4" />
        </Link>
      </PageHero>

      {/* Commands */}
      <section id="commands" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground/80">Commands</p>
          <h2 className="text-3xl font-semibold text-foreground">What it can do</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMMANDS.map((cmd, index) => (
            <div
              key={cmd.name}
              className="glass-card group relative flex flex-col gap-3 overflow-hidden p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:border-violet-400/30 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" role="presentation" aria-hidden="true" />
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />

              <div className="text-3xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" aria-hidden>
                {cmd.icon}
              </div>
              <div className="relative z-10">
                <h3 className="font-mono text-lg font-bold text-foreground group-hover:text-gradient-tools transition-colors">
                  {cmd.name}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground group-hover:text-foreground/80 transition-colors">
                  {cmd.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="glass-card space-y-6 px-8 py-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground/80">How it works</p>
          <h2 className="mt-1 text-3xl font-semibold text-foreground">Three steps to pixel cats</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((item) => (
            <div key={item.step} className="flex flex-col gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                {item.step}
              </span>
              <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Config deep-dive */}
      <section className="glass-card space-y-6 px-8 py-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground/80">Customization</p>
          <h2 className="mt-1 text-3xl font-semibold text-foreground">Make it yours with /config</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONFIG_FEATURES.map((feat) => (
            <div key={feat.label} className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="text-sm font-semibold text-foreground">{feat.label}</span>
              <span className="text-xs text-muted-foreground">{feat.detail}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="flex flex-col items-center gap-5 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-950 px-8 py-12 text-center shadow-[0_0_40px_rgba(245,158,11,0.1)]">
        <h2 className="text-3xl font-semibold text-white">Ready to generate?</h2>
        <p className="max-w-md text-sm text-neutral-200/85">
          Add the bot to your server and start creating unique pixel cats in seconds. No permissions needed.
        </p>
        <Link
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-primary/40 hover:scale-105 animate-pulse-glow"
        >
          Add to Server <ExternalLink className="size-4" />
        </Link>
      </section>
    </main>
  );
}
