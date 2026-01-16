import Link from "next/link";
import Image from "next/image";
import { Twitch, Twitter, Youtube, Cloud, PawPrint, Home, Coffee, Github } from "lucide-react";
import type { ComponentType } from "react";
import type { Metadata } from "next";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";

type LinkCard = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const PRIMARY_LINKS: LinkCard[] = [
  {
    href: "https://twitch.tv/BeastyRabbit",
    label: "Twitch",
    icon: Twitch,
  },
  {
    href: "https://twitter.com/BeastyRabbit",
    label: "X (Twitter)",
    icon: Twitter,
  },
  {
    href: "https://github.com/beastyrabbit",
    label: "GitHub",
    icon: Github,
  },
];

const SECONDARY_LINKS: LinkCard[] = [
  {
    href: "https://www.youtube.com/@beastyrabbit",
    label: "YouTube",
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

function getAge(): number {
  const birthDate = new Date(1990, 8, 1); // September 1, 1990 (month is 0-indexed)
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export const metadata: Metadata = {
  title: "BeastyRabbit | Home",
  description: "Stay connected with BeastyRabbit across socials, goals, and support links.",
  openGraph: {
    title: "BeastyRabbit | Home",
    description: "Stay connected with BeastyRabbit across socials, goals, and support links.",
  },
};

export default function HomePage() {
  const age = getAge();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
      {/* Hero with Banner Background */}
      <section className="relative rounded-3xl overflow-hidden">
        {/* Banner Background */}
        <div className="absolute inset-0">
          <Image
            src="/beasty-banner.png"
            alt=""
            fill
            className="object-cover opacity-40"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 px-8 py-12 text-balance">
          <p className="section-eyebrow">Welcome</p>
          <h1 className="mt-4 text-5xl font-bold leading-tight sm:text-6xl">
            Hey there, I&apos;m <span className="text-gradient-personal animate-shimmer bg-[length:200%_auto]">Beasty.</span>
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-3">
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
              <Twitter className="size-3" /> X
            </Link>
            <DiscordInviteButton className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-all hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)]" />
          </div>
        </div>
      </section>

      {/* About Me */}
      <section className="glass-card px-8 py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-b from-primary/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center md:items-start">
          {/* Profile Image */}
          <div className="shrink-0">
            <Image
              src="/beasty-profile.png"
              alt="BeastyRabbit"
              width={240}
              height={240}
              className="rounded-2xl border-2 border-white/10"
            />
          </div>
          {/* Bio */}
          <div className="space-y-4 text-center md:text-left">
            <p className="section-eyebrow">About me</p>
            <p className="text-lg text-foreground/90 leading-relaxed">
              {age}-year-old self-employed developer from Germany. I&apos;m into next-level tech and gear,
              old-school games, and weird quirky stuff that probably shouldn&apos;t exist... but does.
              Casual gamer and full-time art commission junkie. I run Arch Linux as my daily driver
              and have two cats who offer zero tech support but plenty of chaos.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground">Arch Linux</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground">Tech & Gadgets</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground">Retro Games</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground">Art Collector</span>
            </div>
          </div>
        </div>
      </section>

      {/* Primary Links */}
      <section className="grid gap-4 md:grid-cols-3">
        {PRIMARY_LINKS.map(({ href, label, icon: Icon }, index) => (
          <Link
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card group flex items-center gap-4 p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:border-white/20 animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="p-3 rounded-xl bg-white/5 group-hover:bg-white/10 transition-colors">
              <Icon className="size-7 text-amber-200 group-hover:text-amber-100 transition-colors" />
            </div>
            <span className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
              {label}
            </span>
          </Link>
        ))}
      </section>

      {/* Secondary Links */}
      <section className="glass-card px-6 py-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-b from-slate-800/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <p className="section-eyebrow mb-4">More links</p>
          <div className="flex flex-wrap gap-3">
            {SECONDARY_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-white/20 hover:bg-white/10 hover:text-foreground"
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
