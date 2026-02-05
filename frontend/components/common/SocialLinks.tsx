"use client";

import Link from "next/link";
import { Twitch, Cloud, PawPrint } from "lucide-react";
import TwitterXIcon from "@/components/ui/twitter-x-icon";
import GithubIcon from "@/components/ui/github-icon";
import HomeIcon from "@/components/ui/home-icon";
import CoffeeIcon from "@/components/ui/coffee-icon";
import YoutubeIcon from "@/components/ui/youtube-icon";
import type { ComponentType } from "react";

type LinkCard = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
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
    icon: TwitterXIcon,
  },
  {
    href: "https://github.com/beastyrabbit",
    label: "GitHub",
    icon: GithubIcon,
  },
];

const SECONDARY_LINKS: LinkCard[] = [
  {
    href: "https://www.youtube.com/@beastyrabbit",
    label: "YouTube",
    icon: YoutubeIcon,
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
    icon: HomeIcon,
  },
  {
    href: "https://ko-fi.com/beastyrabbit",
    label: "Ko-fi",
    icon: CoffeeIcon,
  },
];

/** All social links for the personal page (combines primary without GitHub + secondary, with expanded labels) */
const ALL_LINKS: LinkCard[] = [
  { ...PRIMARY_LINKS[0], label: "Twitch Channel" },
  PRIMARY_LINKS[1],
  { ...SECONDARY_LINKS[0], label: "YouTube Channel" },
  ...SECONDARY_LINKS.slice(1),
];

const HERO_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-all hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)]";

/** Hero quick-links (Twitch + Twitter pills) used on the home and personal pages */
export function HeroSocialButtons({ twitterLabel = "X" }: { twitterLabel?: string }) {
  return (
    <>
      <Link
        href="https://twitch.tv/BeastyRabbit"
        target="_blank"
        rel="noopener noreferrer"
        className={HERO_BUTTON_CLASS}
      >
        <Twitch size={12} /> Twitch
      </Link>
      <Link
        href="https://twitter.com/BeastyRabbit"
        target="_blank"
        rel="noopener noreferrer"
        className={HERO_BUTTON_CLASS}
      >
        <TwitterXIcon size={12} /> {twitterLabel}
      </Link>
    </>
  );
}

/** Primary social links grid (3 large cards) used on the home page */
export function PrimarySocialLinks() {
  return (
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
            <Icon size={28} className="text-amber-200 group-hover:text-amber-100 transition-colors" />
          </div>
          <span className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
            {label}
          </span>
        </Link>
      ))}
    </section>
  );
}

/** Secondary social links (pill-style) used on the home page */
export function SecondarySocialLinks() {
  return (
    <div className="flex flex-wrap gap-3">
      {SECONDARY_LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-white/20 hover:bg-white/10 hover:text-foreground"
        >
          <Icon size={16} />
          <span>{label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Combined social links grid used on the personal page */
export function AllSocialLinks() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ALL_LINKS.map(({ href, label, icon: Icon }, index) => (
        <Link
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-card group flex items-center gap-4 p-5 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:border-white/20 animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="p-3 rounded-xl bg-white/5 group-hover:bg-white/10 transition-colors">
            <Icon size={24} className="text-amber-200 group-hover:text-amber-100 transition-colors" />
          </div>
          <span className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
            {label}
          </span>
        </Link>
      ))}
    </div>
  );
}
