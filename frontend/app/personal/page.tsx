import Link from "next/link";
import { Twitch, Twitter, Youtube, Cloud, PawPrint, Home, Coffee } from "lucide-react";
import type { ComponentType } from "react";
import type { Metadata } from "next";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { PageHero } from "@/components/common/PageHero";

type LinkCard = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const ADDITIONAL_LINKS: LinkCard[] = [
  {
    href: "https://twitch.tv/BeastyRabbit",
    label: "Twitch Channel",
    icon: Twitch,
  },
  {
    href: "https://twitter.com/BeastyRabbit",
    label: "X (Twitter)",
    icon: Twitter,
  },
  {
    href: "https://www.youtube.com/@beastyrabbit",
    label: "YouTube Channel",
    icon: Youtube,
  },
  {
    href: "https://bsky.app/profile/beastyrabbit.com",
    label: "Bluesky",
    icon: Cloud,
  },
  {
    href: "https://www.furaffinity.net/user/beastyrabbit",
    label: "FurAffinity",
    icon: PawPrint,
  },
  {
    href: "https://toyhou.se/Beastyrabbit",
    label: "Toyhouse",
    icon: Home,
  },
  {
    href: "https://ko-fi.com/beastyrabbit",
    label: "Ko-fi",
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
        title={<>Hey there, I'm <span className="text-gradient-personal animate-shimmer bg-[length:200%_auto]">Beasty.</span></>}
        description="Germany-based streamer building a cozy English-first space for tech deep dives, offbeat gadgets, and nostalgic games."
      >
        <Link
          href="https://twitch.tv/BeastyRabbit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-all hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)]"
        >
          <Twitch className="size-3" /> Twitch
        </Link>
        <Link
          href="https://twitter.com/BeastyRabbit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-all hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)]"
        >
          <Twitter className="size-3" /> X (Twitter)
        </Link>
        <DiscordInviteButton className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-all hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)]" />
      </PageHero>

      <section className="glass-card space-y-8 px-8 py-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-b from-slate-800/20 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <p className="section-eyebrow">Stay connected</p>
          <h2 className="text-3xl font-bold text-foreground mt-2">Find me across the web</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADDITIONAL_LINKS.map(({ href, label, icon: Icon }, index) => (
            <Link
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card group flex items-center gap-4 p-5 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:border-white/20 animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="p-3 rounded-xl bg-white/5 group-hover:bg-white/10 transition-colors">
                <Icon className="size-6 text-amber-200 group-hover:text-amber-100 transition-colors" />
              </div>
              <span className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
