import { PawPrint } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import type { CSSProperties } from "react";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import {
  HeroSocialButtons,
  PrimarySocialLinks,
  SecondarySocialLinks,
} from "@/components/common/SocialLinks";

function getAge(): number {
  const birthDate = new Date(1990, 8, 1); // September 1, 1990 (month is 0-indexed)
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

const TAGS = [
  { label: "Arch Linux", tilt: "-2.5deg" },
  { label: "Tech & Gadgets", tilt: "1.5deg" },
  { label: "Retro Games", tilt: "-1.5deg" },
  { label: "Art Collector", tilt: "2.5deg" },
];

export const metadata: Metadata = {
  title: "BeastyRabbit | Home",
  description:
    "Stay connected with BeastyRabbit across socials, goals, and support links.",
  openGraph: {
    title: "BeastyRabbit | Home",
    description:
      "Stay connected with BeastyRabbit across socials, goals, and support links.",
  },
};

export default function HomePage() {
  const age = getAge();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
      {/* Hero with Banner Background */}
      <section className="group relative rounded-3xl overflow-hidden">
        {/* Banner Background: slow pan loop, brightens while hovered */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 motion-safe:animate-pan will-change-transform">
            <Image
              src="/beasty-banner.png"
              alt=""
              fill
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="object-cover opacity-40 transition-opacity duration-500 group-hover:opacity-50"
              priority
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 px-8 py-12 text-balance">
          <p className="section-eyebrow motion-safe:animate-track-in">
            Welcome
          </p>
          <h1 className="mt-4 text-5xl font-bold leading-tight sm:text-6xl motion-safe:animate-rise motion-safe:[animation-delay:120ms]">
            Hey there, I&apos;m{" "}
            <span className="group/name text-gradient-personal animate-shimmer bg-[length:200%_auto]">
              Beasty
              <span className="inline-block transition-[rotate,translate] duration-400 ease-spring group-hover/name:rotate-[10deg] group-hover/name:-translate-y-1">
                .
              </span>
            </span>
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <HeroSocialButtons />
            <DiscordInviteButton className="cta-ring inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-all hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)] active:scale-[0.96]" />
          </div>
        </div>
      </section>

      {/* About Me */}
      <section className="glass-card px-8 py-8 relative overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-5 motion-safe:[animation-duration:700ms] motion-safe:[animation-delay:150ms] fill-mode-backwards">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-b from-primary/10 to-transparent rounded-full blur-3xl pointer-events-none motion-safe:animate-drift will-change-transform" />
        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center md:items-start">
          {/* Profile Image: head-tilt on hover, squash on press */}
          <div className="shrink-0">
            <div className="hover-tilt overflow-hidden rounded-2xl border-2 border-white/10">
              <Image
                src="/beasty-profile.png"
                alt="BeastyRabbit"
                width={240}
                height={240}
                className="block"
                draggable={false}
              />
            </div>
          </div>
          {/* Bio */}
          <div className="space-y-4 text-center md:text-left">
            <p className="section-eyebrow">About me</p>
            <p className="text-lg text-foreground/90 leading-relaxed">
              {age}-year-old self-employed developer from Germany. I&apos;m into
              next-level tech and gear, old-school games, and weird quirky stuff
              that probably shouldn&apos;t exist... but does. Casual gamer and
              full-time art commission junkie. I run{" "}
              <span className="caret-hover">Arch Linux</span> as my daily driver
              and have{" "}
              <span className="paw-walk">
                two cats
                {[0, 1, 2, 3].map((i) => (
                  <PawPrint
                    key={`paw-${i.toString()}`}
                    size={12}
                    aria-hidden
                    className="paw-walk__paw"
                    style={{ "--i": i } as CSSProperties}
                  />
                ))}
              </span>{" "}
              who offer zero tech support but plenty of chaos.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {TAGS.map((tag, index) => (
                <span
                  key={tag.label}
                  className="hover-tag rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground motion-safe:animate-pop fill-mode-backwards"
                  style={
                    {
                      "--tilt": tag.tilt,
                      animationDelay: `${450 + index * 60}ms`,
                    } as CSSProperties
                  }
                >
                  {tag.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Primary Links */}
      <PrimarySocialLinks />

      {/* Secondary Links */}
      <section className="glass-card px-6 py-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-b from-slate-800/10 to-transparent rounded-full blur-3xl pointer-events-none motion-safe:animate-drift will-change-transform" />
        <div className="relative z-10">
          <p className="section-eyebrow mb-4">More links</p>
          <SecondarySocialLinks />
        </div>
      </section>
    </main>
  );
}
