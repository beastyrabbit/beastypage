import Image from "next/image";
import type { Metadata } from "next";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { HeroSocialButtons, PrimarySocialLinks, SecondarySocialLinks } from "@/components/common/SocialLinks";

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
            sizes="100vw"
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
            <HeroSocialButtons />
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
      <PrimarySocialLinks />

      {/* Secondary Links */}
      <section className="glass-card px-6 py-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-b from-slate-800/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <p className="section-eyebrow mb-4">More links</p>
          <SecondarySocialLinks />
        </div>
      </section>
    </main>
  );
}
