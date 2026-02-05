import type { Metadata } from "next";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { PageHero } from "@/components/common/PageHero";
import { HeroSocialButtons, AllSocialLinks } from "@/components/common/SocialLinks";

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
        title={<>Hey there, I&apos;m <span className="text-gradient-personal animate-shimmer bg-[length:200%_auto]">Beasty.</span></>}
        description="Germany-based streamer building a cozy English-first space for tech deep dives, offbeat gadgets, and nostalgic games."
      >
        <HeroSocialButtons twitterLabel="X (Twitter)" />
        <DiscordInviteButton className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-amber-100 transition-all hover:border-amber-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)]" />
      </PageHero>

      <section className="glass-card space-y-8 px-8 py-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-b from-slate-800/20 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <p className="section-eyebrow">Stay connected</p>
          <h2 className="text-3xl font-bold text-foreground mt-2">Find me across the web</h2>
        </div>
        <AllSocialLinks />
      </section>
    </main>
  );
}
