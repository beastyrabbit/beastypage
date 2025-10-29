import Link from "next/link";
import { ArrowRight, PenTool, Github, Twitter, Camera, Heart } from "lucide-react";

const PERSONAL_LINKS = [
  { href: "https://github.com/BeastyTwitch", label: "GitHub", icon: Github },
  { href: "https://twitter.com/BeastyRabbit", label: "Twitter", icon: Twitter },
  { href: "https://ko-fi.com/beastyrabbit", label: "Ko-fi", icon: Heart },
];

export default function PersonalLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero theme-personal px-8 py-12 text-balance">
        <div className="section-eyebrow">Personal Lab</div>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl md:text-6xl text-background">
          Modern blacked-out workspace for experiments, art, and notes.
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
          Outside of Cat Gacha, I tinker with design systems, overlays, and personal art projects. This space collects those explorations with a sleek, minimal aesthetic.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="https://ko-fi.com/beastyrabbit"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-lg shadow-primary/25 transition hover:translate-y-0.5 hover:opacity-90"
          >
            Support on Ko-fi <ArrowRight className="size-4" />
          </Link>
          <Link
            href="https://www.instagram.com/beastyrabbit"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-background/40 px-4 py-2 text-sm font-semibold text-background transition hover:bg-background hover:text-foreground"
          >
            Follow updates
          </Link>
        </div>
      </section>

      <section className="glass-card grid gap-6 px-8 py-10 text-muted-foreground lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-4">
          <div className="section-eyebrow">Current focus</div>
          <h2 className="text-3xl font-semibold text-foreground">Design + development</h2>
          <p className="text-sm">
            Documenting the migration process, sharing code snippets, and experimenting with new overlay tech. Expect blog-style updates and downloadable assets.
          </p>
          <div className="grid gap-3 text-sm">
            <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
              <p className="font-semibold text-foreground">Live dev logs</p>
              <p className="text-xs">Ongoing notes captured while rewriting the Cat Gacha stack. Includes learnings, component breakdowns, and performance benchmarks.</p>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
              <p className="font-semibold text-foreground">Overlay R&D</p>
              <p className="text-xs">Exploring metal shader pipelines, dynamic particle systems, and hybrid OBS/Web overlay setups.</p>
            </div>
          </div>
        </div>
        <aside className="glass-card space-y-4 bg-background/60 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <PenTool className="size-4" />
            Art queue
          </div>
          <p className="text-sm">
            Commission slots open seasonally. Check Ko-fi or DM for availability. Batik pattern studies and cat portrait series drop intermittently.
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            {PERSONAL_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-full border border-border/40 px-4 py-2 text-background transition hover:bg-background/80 hover:text-foreground"
              >
                <Icon className="size-3" />
                {label}
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section className="glass-card space-y-4 px-8 py-10 text-muted-foreground">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Camera className="size-4" />
          Behind the scenes
        </div>
        <p className="text-sm">
          Expect photo dumps, design breakdowns, and occasional dev streams focused on the infrastructure powering Cat Gacha.
        </p>
      </section>
    </main>
  );
}
