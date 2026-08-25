import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Test Pages",
  description: "Internal test pages for renderer and UI quality checks.",
};

export default function TestsLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero px-8 py-12 text-balance">
        <div className="section-eyebrow">Sandbox & QA</div>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl md:text-6xl">
          Test Pages & Feature Experiments
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
          Lightweight environments for trying out new pipeline steps, UI
          treatments, and renderer tweaks before they roll into the main gacha
          flow.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div
            className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-cyan-400/15 via-transparent to-fuchsia-500/10"
            aria-hidden
          />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">
              Custom Accessory Fit Check
            </span>
            <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-[11px] font-semibold text-cyan-300">
              Sprites
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Inspect three original pixel accessories on all 26 named cat poses
            at the renderer&apos;s native 50 × 50 resolution.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/tests/custom-accessories"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Open fit check
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div
            className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-orange-400/15 via-transparent to-amber-500/15"
            aria-hidden
          />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">
              Coat Pattern Atlas
            </span>
            <span className="rounded-full bg-orange-500/15 px-3 py-1 text-[11px] font-semibold text-orange-300">
              Patterns
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Inspect twenty new pose-aware coat markings at the cat renderer's
            native 50 × 50 resolution.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/tests/cat-coat-patterns"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Open atlas
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div
            className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-amber-400/15 via-transparent to-rose-500/15"
            aria-hidden
          />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">
              Renderer Stress Harness
            </span>
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-400">
              Reliability
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Fire controlled bursts against <code>/api/renderer</code>, monitor
            retries, and verify the queue / circuit breaker behaviour from the
            browser.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/tests/renderer-stress"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Open stress test
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div
            className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-lime-400/10 via-transparent to-amber-400/10"
            aria-hidden
          />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">
              LifeGen Accessory Check
            </span>
            <span className="rounded-full bg-lime-500/15 px-3 py-1 text-[11px] font-semibold text-lime-300">
              Sprites
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Compare all 22 adapted or renamed accessories and ten current
            LifeGen examples across the three new ClanGen poses.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/tests/lifegen-accessories"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Open matrix
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div
            className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-teal-400/15 via-transparent to-lime-400/15"
            aria-hidden
          />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">
              Sprite Asset Explorer
            </span>
            <span className="rounded-full bg-teal-500/15 px-3 py-1 text-[11px] font-semibold text-teal-300">
              Sprites
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse every sprite group bundled with V3, inspect all 21 frames,
            and confirm new genemod, border, and missing-part assets without
            diving into the sheet manually.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/dev/sprite-explorer"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Inspect sprites
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
