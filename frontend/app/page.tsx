import Link from "next/link";
import { ArrowRight, Calendar, Github, MonitorPlay, Twitch, Twitter } from "lucide-react";

const HUB_PILLARS = [
  {
    href: "/gatcha",
    title: "Gatcha",
    description: "Catdex, premium wheel, and sprite pipeline — rebuilt with Convex.",
    accent: "gatcha",
  },
  {
    href: "/stream",
    title: "Stream Tools",
    description: "Overlay automations, chat triggers, and mod dashboards for live shows.",
    accent: "stream",
  },
  {
    href: "/collection",
    title: "Collection",
    description: "Art drops, mood boards, and archives from years of cat events.",
    accent: "collection",
  },
  {
    href: "/personal",
    title: "Personal",
    description: "Behind-the-scenes work, socials, commissions, and experiment logs.",
    accent: "personal",
  },
];

const NEWS_ITEMS = [
  {
    title: "Catdex migration live",
    description: "React + Convex submission flow has landed. Upload default and custom art today.",
  },
  {
    title: "Single Cat Plus port",
    description: "Renderer TypeScript moving into React components. Expect early access soon.",
  },
  {
    title: "Stream overlays 2.0",
    description: "Wheel, queue, and donation triggers are being consolidated under Convex state.",
  },
];

const COMMUNITY_LINKS = [
  { href: "https://github.com/BeastyTwitch", label: "GitHub", icon: Github },
  { href: "https://twitch.tv/BeastyRabbit", label: "Twitch", icon: Twitch },
  { href: "https://twitter.com/BeastyRabbit", label: "Twitter", icon: Twitter },
];

export default function HubLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero theme-gatcha px-8 py-12 text-balance">
        <div className="section-eyebrow">Beasty Hub</div>
        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
          All gatcha systems, stream tech, and creative labs live under one roof.
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground sm:text-xl">
          Follow ongoing migrations from the legacy Bun stack to Next.js 15, React 19, Tailwind v4, and Convex. Explore the Cat Gacha ecosystem, stream automations, art collections, and personal experiments.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/gatcha"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:translate-y-0.5 hover:opacity-90"
          >
            Dive into Gatcha <ArrowRight className="size-4" />
          </Link>
          <Link
            href="https://discord.gg/convex"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-foreground/30 px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            Join the build channel
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HUB_PILLARS.map((pillar) => (
          <Link
            key={pillar.href}
            href={pillar.href}
            className={`glass-card relative overflow-hidden p-5 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl`}
          >
            <div className={`theme-hero theme-${pillar.accent} absolute inset-0 opacity-60`} aria-hidden />
            <div className="relative flex h-full flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                {pillar.title}
              </span>
              <h3 className="text-lg font-semibold text-foreground">{pillar.title}</h3>
              <p className="text-sm text-muted-foreground">{pillar.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Explore <ArrowRight className="size-3" />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section className="glass-card grid gap-8 px-8 py-10 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <div className="section-eyebrow">New & noteworthy</div>
          <h2 className="text-3xl font-semibold">Shipping updates</h2>
          <div className="space-y-5">
            {NEWS_ITEMS.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
        <aside className="glass-card space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar className="size-4 text-primary" />
            Stream Schedule
          </div>
          <p className="text-sm text-muted-foreground">
            Live most weekends — follow Twitch for notifications. Wheel testing and Catdex moderation runs happen mid-week on Discord.
          </p>
          <div className="rounded-2xl border border-border/60 bg-background/60 p-4 text-xs text-muted-foreground">
            <p>• Friday: Overlay QA & wheel triggers</p>
            <p>• Saturday: Cat Gacha stream + new cats</p>
            <p>• Sunday: Art catch-up / community showcase</p>
          </div>
        </aside>
      </section>

      <section className="glass-card grid gap-6 px-8 py-10 lg:grid-cols-[1fr,1fr]">
        <div className="space-y-4">
          <div className="section-eyebrow">Featured clip</div>
          <h2 className="text-2xl font-semibold">Legendary pull on stream</h2>
          <p className="text-sm text-muted-foreground">
            Rewatch the moment the wheel dropped a Singularity cat mid charity stream. The new overlay pipeline will let us replay moments like this instantly.
          </p>
          <Link
            href="https://www.youtube.com/@beastyrabbit"
            target="_blank"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-foreground/30 px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            Watch on YouTube <MonitorPlay className="size-3" />
          </Link>
        </div>
        <div className="glass-card bg-background/70 p-6 text-sm text-muted-foreground">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Community
          </div>
          <p>Contribute ideas, sprites, or code. The migration is public and we welcome PRs and art submissions.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {COMMUNITY_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-full border border-border/50 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
              >
                <Icon className="size-3" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
