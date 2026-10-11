"use client";

import { Chrome, Cloud, Layers, PawPrint, Twitch } from "lucide-react";
import Link from "next/link";
import {
  type ComponentType,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type RefObject,
  useRef,
} from "react";
import CoffeeIcon from "@/components/ui/coffee-icon";
import GithubIcon from "@/components/ui/github-icon";
import HomeIcon from "@/components/ui/home-icon";
import TwitterXIcon from "@/components/ui/twitter-x-icon";
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from "@/components/ui/types";
import YoutubeIcon from "@/components/ui/youtube-icon";

type AnimatedIcon = ForwardRefExoticComponent<
  AnimatedIconProps & RefAttributes<AnimatedIconHandle>
>;
type StaticIcon = ComponentType<{ className?: string; size?: number }>;

/** CSS hover verb for static icons (see `.icon-verb` in globals.css). */
type IconVerb = "grow" | "lift" | "cloud" | "stamp" | "spin";

type LinkCard = {
  href: string;
  label: string;
  verb?: IconVerb;
} & (
  | { kind: "animated"; icon: AnimatedIcon }
  | { kind: "static"; icon: StaticIcon }
);

const PRIMARY_LINKS: LinkCard[] = [
  {
    href: "https://twitch.tv/BeastyRabbit",
    label: "Twitch",
    kind: "static",
    icon: Twitch,
  },
  {
    href: "https://twitter.com/BeastyRabbit",
    label: "X (Twitter)",
    kind: "animated",
    icon: TwitterXIcon,
  },
  {
    href: "https://github.com/beastyrabbit",
    label: "GitHub",
    kind: "animated",
    icon: GithubIcon,
  },
];

const SECONDARY_LINKS: LinkCard[] = [
  {
    href: "https://www.youtube.com/@beastyrabbit",
    label: "YouTube",
    kind: "animated",
    icon: YoutubeIcon,
  },
  {
    href: "https://moddrop.live/",
    label: "ModDrop",
    kind: "static",
    icon: Layers,
    verb: "lift",
  },
  {
    href: "https://bsky.app/profile/beastyrabbit.com",
    label: "Bluesky",
    kind: "static",
    icon: Cloud,
    verb: "cloud",
  },
  {
    href: "https://www.furaffinity.net/user/beastyrabbit",
    label: "FurAffinity",
    kind: "static",
    icon: PawPrint,
    verb: "stamp",
  },
  {
    href: "https://toyhou.se/Beastyrabbit",
    label: "Toyhouse",
    kind: "animated",
    icon: HomeIcon,
  },
  {
    href: "https://ko-fi.com/beastyrabbit",
    label: "Ko-fi",
    kind: "animated",
    icon: CoffeeIcon,
  },
  {
    href: "https://chromewebstore.google.com/detail/Tab%20Organizer/nnoleclnibghacjbilmdfalllpnongpn?hl=de&authuser=0",
    label: "Tab Organizer",
    kind: "static",
    icon: Chrome,
    verb: "spin",
  },
];

/** All social links for the personal page (combines primary without GitHub + secondary, with expanded labels) */
const ALL_LINKS: LinkCard[] = [
  { ...PRIMARY_LINKS[0], label: "Twitch Channel" },
  PRIMARY_LINKS[1],
  { ...SECONDARY_LINKS[0], label: "YouTube Channel" },
  ...SECONDARY_LINKS.slice(1),
];

const LINK_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const HERO_BUTTON_CLASS = `group inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-[translate,scale,background-color,border-color,box-shadow,color] duration-200 hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)] motion-safe:hover:-translate-y-px active:scale-[0.96] ${LINK_FOCUS_CLASS}`;

const CARD_CLASS = `glass-card group flex items-center gap-4 transition-[translate,border-color,box-shadow,background-color] duration-300 ease-out-soft motion-safe:hover:-translate-y-[5px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-8 motion-reduce:opacity-100 fill-mode-backwards ${LINK_FOCUS_CLASS}`;

const CARD_ICON_BOX_CLASS =
  "rounded-xl bg-white/5 p-3 transition-[rotate,scale,background-color] duration-300 ease-spring group-hover:rotate-[5deg] group-hover:scale-[1.08] group-hover:bg-white/10";

/** Lets the whole link drive an itshover icon, not just its small svg. */
function useIconHover() {
  const ref = useRef<AnimatedIconHandle>(null);
  const start = () => ref.current?.startAnimation();
  const stop = () => ref.current?.stopAnimation();
  return {
    ref,
    handlers: {
      onPointerEnter: start,
      onPointerLeave: stop,
      onFocus: start,
      onBlur: stop,
    },
  };
}

function CardIcon({
  card,
  iconRef,
  size,
  className,
}: {
  card: LinkCard;
  iconRef: RefObject<AnimatedIconHandle | null>;
  size: number;
  className?: string;
}) {
  if (card.kind === "animated") {
    const Icon = card.icon;
    return <Icon ref={iconRef} size={size} className={className} />;
  }
  const Icon = card.icon;
  return <Icon size={size} className={className} />;
}

/** Hero quick-links (Twitch + Twitter pills) used on the home and personal pages */
export function HeroSocialButtons({
  twitterLabel = "X",
}: Readonly<{
  twitterLabel?: string;
}>) {
  return (
    <>
      <Link
        href="https://twitch.tv/BeastyRabbit"
        target="_blank"
        rel="noopener noreferrer"
        className={HERO_BUTTON_CLASS}
      >
        <Twitch
          size={12}
          className="transition-[rotate,scale] duration-300 ease-spring group-hover:-rotate-[10deg] group-hover:scale-[1.2]"
        />{" "}
        Twitch
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

function SocialCard({
  card,
  index,
  size,
}: {
  card: LinkCard;
  index: number;
  size: "lg" | "md";
}) {
  const { ref, handlers } = useIconHover();
  const large = size === "lg";
  return (
    <Link
      href={card.href}
      target="_blank"
      rel="noopener noreferrer"
      {...handlers}
      className={`${CARD_CLASS} ${large ? "p-6" : "p-5"}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className={CARD_ICON_BOX_CLASS}>
        <CardIcon
          card={card}
          iconRef={ref}
          size={large ? 28 : 24}
          className="text-amber-200 group-hover:text-amber-100 transition-colors"
        />
      </div>
      <span
        className={`${large ? "text-xl" : "text-lg"} font-bold text-foreground group-hover:text-primary transition-colors`}
      >
        {card.label}
      </span>
    </Link>
  );
}

function SocialPill({ card }: { card: LinkCard }) {
  const { ref, handlers } = useIconHover();
  return (
    <Link
      href={card.href}
      target="_blank"
      rel="noopener noreferrer"
      {...handlers}
      data-verb={card.verb}
      className={`icon-verb group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-muted-foreground transition-[scale,background-color,border-color,color] duration-200 hover:border-white/20 hover:bg-white/10 hover:text-foreground active:scale-[0.96] ${LINK_FOCUS_CLASS}`}
    >
      <CardIcon card={card} iconRef={ref} size={16} />
      <span>{card.label}</span>
    </Link>
  );
}

/** Primary social links grid (3 large cards) used on the home page */
export function PrimarySocialLinks() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {PRIMARY_LINKS.map((card, index) => (
        <SocialCard key={card.label} card={card} index={index} size="lg" />
      ))}
    </section>
  );
}

/** Secondary social links (pill-style) used on the home page */
export function SecondarySocialLinks() {
  return (
    <div className="flex flex-wrap gap-3">
      {SECONDARY_LINKS.map((card) => (
        <SocialPill key={card.label} card={card} />
      ))}
    </div>
  );
}

/** Combined social links grid used on the personal page */
export function AllSocialLinks() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ALL_LINKS.map((card, index) => (
        <SocialCard key={card.label} card={card} index={index} size="md" />
      ))}
    </div>
  );
}
