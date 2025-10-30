import Link from "next/link";
import { Twitch, Twitter, Youtube, Cloud, PawPrint, Home, Coffee } from "lucide-react";
import type { ComponentType } from "react";
import type { Metadata } from "next";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { PageHero } from "@/components/common/PageHero";

type LinkCard = {
  href: string;
  label: string;
  sublabel: string;
  icon: ComponentType<{ className?: string }>;
};

const ADDITIONAL_LINKS: LinkCard[] = [
  {
    href: "https://twitch.tv/BeastyRabbit",
    label: "Twitch Channel",
    sublabel: "Live streams and tech chaos.",
    icon: Twitch,
  },
  {
    href: "https://twitter.com/BeastyRabbit",
    label: "X (Twitter)",
    sublabel: "Real-time updates & gadget musings.",
    icon: Twitter,
  },
  {
    href: "https://www.youtube.com/@beastyrabbit",
    label: "YouTube Channel",
    sublabel: "VODs, edited recaps, and devlogs.",
    icon: Youtube,
  },
  {
    href: "https://bsky.app/profile/beastyrabbit.com",
    label: "Bluesky",
    sublabel: "Long-form updates and community posts.",
    icon: Cloud,
  },
  {
    href: "https://www.furaffinity.net/user/beastyrabbit",
    label: "FurAffinity",
    sublabel: "Illustrations and commission backlog.",
    icon: PawPrint,
  },
  {
    href: "https://toyhou.se/Beastyrabbit",
    label: "Toyhouse",
    sublabel: "Character sheets and lore notes.",
    icon: Home,
  },
  {
    href: "https://ko-fi.com/beastyrabbit",
    label: "Ko-fi",
    sublabel: "Support the stream and projects.",
    icon: Coffee,
  },
];

export const metadata: Metadata = {
  title: "BeastyRabbit Personal Hub",
  description: "Stay connected with BeastyRabbit across socials, goals, and support links.",
  openGraph: {
    title: "BeastyRabbit Personal Hub",
    description: "Stay connected with BeastyRabbit across socials, goals, and support links.",
  },
};

export default function PersonalLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <PageHero
        eyebrow="About BeastyRabbit"
        title="Hey there, I'm Beasty."
        description="Germany-based streamer building a cozy English-first space for tech deep dives, offbeat gadgets, and nostalgic games."
      >
        <Link
          href="https://twitch.tv/BeastyRabbit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-300/60 hover:text-white"
        >
          <Twitch className="size-3" /> Twitch
        </Link>
        <Link
          href="https://twitter.com/BeastyRabbit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-300/60 hover:text-white"
        >
          <Twitter className="size-3" /> X (Twitter)
        </Link>
        <DiscordInviteButton className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-300/60 hover:text-white" />
      </PageHero>

      <section className="glass-card space-y-6 px-8 py-10">
        <div>
          <p className="section-eyebrow">Stay connected</p>
          <h2 className="text-2xl font-semibold text-foreground">Find me across the web</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADDITIONAL_LINKS.map(({ href, label, sublabel, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-2 rounded-2xl border border-border/40 bg-background/70 p-4 transition hover:-translate-y-1 hover:border-amber-400/40 hover:bg-background/90"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="size-4 text-amber-200" />
                {label}
              </div>
              <p className="text-xs text-muted-foreground/80">{sublabel}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
